const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

/**
 * Read a JSON file from the data directory.
 * @param {string} filename - e.g. 'users.json'
 * @returns {Array|Object}
 */
function read(filename) {
  const filePath = path.join(DATA_DIR, filename);
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Write data to a JSON file in the data directory.
 * @param {string} filename - e.g. 'users.json'
 * @param {Array|Object} data
 */
function write(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = { read, write };
