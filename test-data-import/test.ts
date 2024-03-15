// Dependencies
import * as fs from 'fs';

// Interface to represent the data structure in the JSON file
interface AddressAmount {
  address: string;
  amount: string;
}

// Function to parse the JSON data
function parseData(data: string): Map<string, string> {
  const parsedData: AddressAmount[] = JSON.parse(data); // Parse with type assertion

  const map: Map<string, string> = new Map<string, string>();

  parsedData.forEach((item) => {
    map.set(item.address, item.amount);
  });

  return map;
}

function loadAndParseData(filePath: string): Map<string, string> {
  try {
    // Read the file content synchronously (not recommended)
    const data: string = fs.readFileSync(filePath, 'utf-8');
    return parseData(data);
  } catch (error) {
    console.error("Error loading data:", error);
    throw error; // Re-throw the error for handling
  }
}

// Example usage
const filePath = './init_data.json';

let data = loadAndParseData(filePath)

console.log(data.get("test1"))
