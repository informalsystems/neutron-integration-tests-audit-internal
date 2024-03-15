"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Dependencies
var fs = require("fs");
// Function to parse the JSON data
function parseData(data) {
    var parsedData = JSON.parse(data); // Parse with type assertion
    var map = new Map();
    parsedData.forEach(function (item) {
        map.set(item.address, item.amount);
    });
    return map;
}
function loadAndParseData(filePath) {
    try {
        // Read the file content synchronously (not recommended)
        var data_1 = fs.readFileSync(filePath, 'utf-8');
        return parseData(data_1);
    }
    catch (error) {
        console.error("Error loading data:", error);
        throw error; // Re-throw the error for handling
    }
}
// Example usage
var filePath = './init_data.json';
var data = loadAndParseData(filePath);
console.log(data.get("test1"));
