// Starter code shown in the editor for each language.

export const DEFAULT_CODE = {
    javascript: `// Write your solution here
function solution(input) {
  // your code
}

// Print something to test your solution with the Run button
console.log(solution());`,
    python: `# Write your solution here
def solution(data):
    pass

# Print something to test your solution with the Run button
print(solution(None))`,
    java: `// Write your solution here
public class Solution {
    public static void main(String[] args) {
        // your code
    }
}`,
    cpp: `// Write your solution here
#include <iostream>
using namespace std;

int main() {
    // your code
    return 0;
}`,
}

export const isTemplate = (code) => Object.values(DEFAULT_CODE).some((t) => t.trim() === String(code || "").trim())
