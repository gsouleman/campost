const fs = require('fs');
const content = fs.readFileSync('c:/CAM/campost/public/index.html', 'utf8');

const start = content.indexOf('<script>') + 8;
const end = content.lastIndexOf('</script>');
const script = content.substring(start, end);

let stack = [];
let lines = script.split('\n');

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Remove comments roughly
    let clean = line;
    // Remove single line comments
    clean = clean.replace(/\/\/.*$/, '');

    // Note: Block comments are hard to handle line-by-line without state, ignoring for now assuming sparse usage

    for (const char of clean) {
        if (char === '{') {
            stack.push(i + 1); // 1-based index (relative to script start)
        }
        if (char === '}') {
            if (stack.length > 0) {
                stack.pop();
            } else {
                console.log(`Error: Unexpected } at line (script-relative) ${i + 1}: ${line.trim()}`);
            }
        }
    }
}

console.log(`Final Stack Depth: ${stack.length}`);
if (stack.length > 0) {
    console.log('Unclosed braces opened at lines (script-relative):');
    console.log(stack.join(', '));
    console.log('Most likely culprit: Line ' + stack[stack.length - 1]);
    console.log('Content of culprit line: ' + lines[stack[stack.length - 1] - 1].trim());

    // Calculate global line number (approx)
    // We need to count newlines before <script>
    const preScript = content.substring(0, start);
    const globalOffset = preScript.split('\n').length;
    console.log('Global Line Number (approx): ' + (stack[stack.length - 1] + globalOffset - 1));
}
