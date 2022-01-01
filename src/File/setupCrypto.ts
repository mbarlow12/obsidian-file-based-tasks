const {webcrypto, randomFillSync} = require('crypto');
const util = require('util');

global.TextEncoder = util.TextEncoder;

Object.defineProperty(global.self, 'crypto', {
   value: {
       getRandomValues: <T extends ArrayBufferView | null>(array: T): T => {
           return randomFillSync(array);
       },
       subtle: webcrypto.subtle
   }
});