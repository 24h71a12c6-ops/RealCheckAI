const assert = require('@agent/assert');

test('Server should respond with status 200', async () => {
    const response = await fetch('http://localhost:3000');
    assert.strictEqual(response.status, 200);
});

test('Server should return JSON data', async () => {
    const response = await fetch('http://localhost:3000/data');
    const data = await response.json();
    assert.strictEqual(typeof data, 'object');
});