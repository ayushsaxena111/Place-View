// Test-only in-memory replacement for the Mongoose model methods the
// controllers use. Documents are real Mongoose documents (hydrated per query),
// so schema casting, defaults and validation still run; only storage is faked.
//
// Supports: create, find, findOne, findById, findOneAndUpdate, updateOne,
// deleteOne, countDocuments, doc.save — with $set/$inc updates and
// equality / $ne / $lt / $gte / $in / $or filters on (dotted) paths.

import { mock } from "node:test"

const get = (obj, path) => path.split(".").reduce((v, k) => (v == null ? v : v[k]), obj)

const set = (obj, path, value) => {
    const keys = path.split(".")
    let cur = obj
    for (const k of keys.slice(0, -1)) {
        if (cur[k] == null || typeof cur[k] !== "object") cur[k] = {}
        cur = cur[k]
    }
    cur[keys.at(-1)] = value
}

const isObjectId = (v) => v != null && typeof v === "object" && v._bsontype === "ObjectId"

const norm = (v) => {
    if (isObjectId(v)) return v.toString()
    if (v instanceof Date) return v.getTime()
    return v
}

// structuredClone would turn ObjectIds into plain objects, so clone by hand.
const deepClone = (v) => {
    if (v === null || typeof v !== "object") return v
    if (isObjectId(v)) return new v.constructor(v.toHexString())
    if (typeof v.toObject === "function" && !(v instanceof Map)) return deepClone(v.toObject())
    if (v instanceof Date) return new Date(v.getTime())
    if (v instanceof Map) return new Map([...v].map(([k, val]) => [k, deepClone(val)]))
    if (Buffer.isBuffer(v)) return Buffer.from(v)
    if (Array.isArray(v)) return v.map(deepClone)
    const out = {}
    for (const [k, val] of Object.entries(v)) out[k] = deepClone(val)
    return out
}

const isOperatorObject = (v) =>
    v && typeof v === "object" && !(v instanceof Date) && !isObjectId(v) &&
    Object.keys(v).some((k) => k.startsWith("$"))

const matchValue = (actual, cond) => {
    if (isOperatorObject(cond)) {
        return Object.entries(cond).every(([op, val]) => {
            const a = norm(actual)
            const b = norm(val)
            switch (op) {
                case "$ne": return actual == null ? val != null : a !== b
                case "$lt": return actual != null && a < b
                case "$gte": return actual != null && a >= b
                case "$in": return val.map(norm).includes(a)
                default: throw new Error(`memoryModel: unsupported operator ${op}`)
            }
        })
    }
    if (cond === null) return actual === null || actual === undefined
    return String(norm(actual)) === String(norm(cond))
}

export const matches = (doc, filter = {}) =>
    Object.entries(filter).every(([key, cond]) => {
        if (key === "$or") return cond.some((f) => matches(doc, f))
        return matchValue(get(doc, key), cond)
    })

const applyUpdate = (doc, update) => {
    const hasOps = Object.keys(update).some((k) => k.startsWith("$"))
    const ops = hasOps ? update : { $set: update }
    for (const [op, fields] of Object.entries(ops)) {
        for (const [path, value] of Object.entries(fields)) {
            if (op === "$set") set(doc, path, value)
            else if (op === "$inc") set(doc, path, (get(doc, path) || 0) + value)
            else throw new Error(`memoryModel: unsupported update ${op}`)
        }
    }
}

const query = (resultFn) => {
    const q = {
        _sort: null, _skip: 0, _limit: null,
        select() { return q },
        lean() { q._lean = true; return q },
        sort(s) { q._sort = s; return q },
        skip(n) { q._skip = n; return q },
        limit(n) { q._limit = n; return q },
        then(resolve, reject) {
            return Promise.resolve().then(() => resultFn(q)).then(resolve, reject)
        },
    }
    return q
}

export const installMemoryModel = (Model) => {
    const store = new Map()
    const toPlain = (doc) => doc.toObject({ depopulate: true })
    const hydrate = (plain) => Model.hydrate(deepClone(plain))

    const sortDocs = (docs, sort) => {
        if (!sort) return docs
        const [[key, dir]] = Object.entries(sort)
        return [...docs].sort((a, b) => (norm(get(a, key)) > norm(get(b, key)) ? dir : -dir))
    }

    const all = () => [...store.values()]

    // Mongoose sets timestamps in its save hooks, which these fakes bypass.
    const stamp = (doc) => {
        if (!Model.schema.options.timestamps) return
        const now = new Date()
        if (!doc.createdAt) doc.createdAt = now
        doc.updatedAt = now
    }

    const mocks = [
        mock.method(Model, "create", async (data) => {
            const doc = new Model(data)
            stamp(doc)
            await doc.validate()
            store.set(String(doc._id), toPlain(doc))
            return hydrate(store.get(String(doc._id)))
        }),
        mock.method(Model, "findOne", (filter) =>
            query((q) => {
                const docs = sortDocs(all().filter((d) => matches(d, filter)), q._sort)
                const found = docs[0]
                if (!found) return null
                return q._lean ? deepClone(found) : hydrate(found)
            })
        ),
        mock.method(Model, "findById", (id) =>
            query((q) => {
                const found = store.get(String(id))
                if (!found) return null
                return q._lean ? deepClone(found) : hydrate(found)
            })
        ),
        mock.method(Model, "find", (filter) =>
            query((q) => {
                let docs = sortDocs(all().filter((d) => matches(d, filter)), q._sort).slice(q._skip)
                if (q._limit) docs = docs.slice(0, q._limit)
                return docs.map((d) => (q._lean ? deepClone(d) : hydrate(d)))
            })
        ),
        mock.method(Model, "countDocuments", async (filter) => all().filter((d) => matches(d, filter)).length),
        mock.method(Model, "findOneAndUpdate", (filter, update, options = {}) =>
            query(async () => {
                let found = all().find((d) => matches(d, filter))
                if (!found) {
                    if (!options.upsert) return null
                    const base = {}
                    for (const [k, v] of Object.entries(filter)) if (!isOperatorObject(v) && !k.startsWith("$")) set(base, k, v)
                    const doc = new Model(base)
                    found = toPlain(doc)
                }
                const copy = deepClone(found)
                applyUpdate(copy, update)
                const doc = hydrate(copy)
                stamp(doc)
                await doc.validate()
                store.set(String(doc._id), toPlain(doc))
                return hydrate(store.get(String(doc._id)))
            })
        ),
        mock.method(Model, "updateOne", async (filter, update) => {
            const found = all().find((d) => matches(d, filter))
            if (!found) return { matchedCount: 0, modifiedCount: 0 }
            applyUpdate(found, update)
            return { matchedCount: 1, modifiedCount: 1 }
        }),
        mock.method(Model, "deleteOne", async (filter) => {
            const found = all().find((d) => matches(d, filter))
            if (!found) return { deletedCount: 0 }
            store.delete(String(found._id))
            return { deletedCount: 1 }
        }),
        mock.method(Model.prototype, "save", async function () {
            stamp(this)
            await this.validate()
            store.set(String(this._id), toPlain(this))
            this.isNew = false
            return this
        }),
    ]

    return {
        store,
        get: (id) => store.get(String(id)),
        restore: () => mocks.forEach((m) => m.mock.restore()),
    }
}
