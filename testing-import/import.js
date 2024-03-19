"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Dependencies
var fs = require("fs");
function filterMapByPropertyFunctional(map, propertyName, filterValue) {
    return new Map(Array.from(map.entries()).filter(function (_a) {
        var key = _a[0], value = _a[1];
        return value[propertyName] === filterValue;
    }));
}
function filterMapByPropertiesFunctional(map, property1, property2, filterValue1, filterValue2) {
    return new Map(Array.from(map.entries()).filter(function (_a) {
        var key = _a[0], value = _a[1];
        return value[property1] === filterValue1 && value[property2] === filterValue2;
    }));
}
// Function to parse the JSON data
function parseData(data) {
    var parsedData = JSON.parse(data); // Parse with type assertion  
    var map = new Map();
    parsedData.forEach(function (item) {
        map.set(item.address, { amount: item.amount, claims_rewards: item.claims_rewards, withdraws_rewards: item.withdraws_rewards });
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
var filePath = './data.json';
var data = loadAndParseData(filePath);
console.log(data.get("test1"));
console.log(filterMapByPropertiesFunctional(data, "claims_rewards", "withdraws_rewards", true, true));
