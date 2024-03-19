// Dependencies
import * as fs from 'fs';

// Interface to represent the data structure in the JSON file
interface UsersAmount {
  address: string;
  amount: string;
  claims_rewards: boolean;
  withdraws_rewards: boolean;
}
interface AmountAndClaimsRewards {
  amount: string;
  claims_rewards: boolean;
  withdraws_rewards: boolean
}
function filterMapByPropertyFunctional<TValue>(
  map: Map<string, TValue>,
  propertyName: string,
  filterValue: any
): Map<string, TValue> {
  return new Map(
    Array.from(map.entries()).filter(([key, value]) => value[propertyName] === filterValue)
  );
}
function filterMapByPropertiesFunctional<TValue>(
  map: Map<string, TValue>,
  property1: string,
  property2: string,
  filterValue1: any,
  filterValue2: any

): Map<string, TValue> {
  return new Map(
    Array.from(map.entries()).filter(([key, value]) => value[property1] === filterValue1 && value[property2] === filterValue2)
  );
}
// Function to parse the JSON data
function parseData(data: string): Map<string, AmountAndClaimsRewards> {
  const parsedData: UsersAmount[] = JSON.parse(data); // Parse with type assertion  
  const map: Map<string, AmountAndClaimsRewards> = new Map<string, AmountAndClaimsRewards>();

  parsedData.forEach((item) => {
    map.set(item.address, { amount : item.amount, claims_rewards: item.claims_rewards, withdraws_rewards: item.withdraws_rewards});
  });

  return map;
}

function loadAndParseData(filePath: string): Map<string, AmountAndClaimsRewards> {
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
const filePath = './data.json';

let data = loadAndParseData(filePath)

console.log(data.get("test1"))


console.log(filterMapByPropertiesFunctional(data, "claims_rewards", "withdraws_rewards", true,true))