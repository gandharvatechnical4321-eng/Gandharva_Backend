const { model } = require("mongoose");

const encryptionMap = {
    '9': 's@',
    '8': 'h]?',
    '7': '$y',
    '6': 'a%',
    '5': '#}m',
    '4': '*u',
    '3': 'n(',
    '2': '){d',
    '1': '!r',
    '0': 'p/&'
};

const decryptionMap = Object.fromEntries(
    Object.entries(encryptionMap).map(([key, value]) => [value, key])
);

function encryptFunction(input) {
    return input.slice(0, 4) + input.slice(4).split('').map(char => encryptionMap[char] || char).join('');
}

function decryptFunction(input) {
    let originalPart = input.slice(0, 4);
    let encryptedPart = input.slice(4);
    
    // Check if already decrypted (contains only digits after first 4 characters)
    if (/^\d+$/.test(encryptedPart)) {
        return input; // Return as is if already decrypted
    }
    
    let output = originalPart + encryptedPart;
    for (const [enc, num] of Object.entries(decryptionMap)) {
        output = originalPart + output.slice(4).split(enc).join(num);
    }
    return output;
}

module.exports = {encryptFunction, decryptFunction}