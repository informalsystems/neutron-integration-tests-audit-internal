import * as fs from 'fs';
import { Trace, State, User, ReadingState, ReadingTrace, InitAmounts } from "./structs";


const readStatesFromFile = () : State[] => {
  const jsonString = fs.readFileSync('./traces/fullMigrationHappened_trace0.itf.json', 'utf8'); // Replace with your file reading logic
  const data: ReadingTrace = JSON.parse(jsonString);
  const reading_states: ReadingState[] = data.states;
  let states : State[] = []
  
  reading_states.forEach((v) => {
    const users_map : Map<string, User> = new Map<string, User>()
    v.users["#map"].forEach(element => {
      users_map.set(element[0] as string, element[1] as User);
    });
    states.push({stepInfo: v.stepInfo, users: users_map, numSteps: v.numSteps['#bigint']})
  })
  return states;
};

export const getInitialState = () : State => {
  let initialState = readStatesFromFile()[0];
  let usersStatesMap : Map<string, InitAmounts> = new Map<string, InitAmounts>();
  initialState.stepInfo.msgArgs.value["#map"].forEach(function (element) {
      usersStatesMap.set(element[0], { ATOM_locked: element[1].ATOM_locked["#bigint"] as number, NTRN_locked: element[1].NTRN_locked["#bigint"]  as number, USDC_locked: element[1].USDC_locked["#bigint"] as number });
  });
  initialState.stepInfo.msgArgs.value = usersStatesMap;
  return initialState;
};

export const getAllOtherStates = () : State[] => readStatesFromFile().slice(1);

function testMatcher() {
  var index = 0;
  var states = getAllOtherStates();
  for(let state of states){
    switch(state.stepInfo.actionTaken){
      case 'advance_block': {
        console.log(`[${state.numSteps}][ADVANCE BLOCK]`);
        break;
      }
      case 'migrate': {
        console.log(`[${state.numSteps}][MIGRATE]\n[Executor: ${state.stepInfo.msgInfo.sender}]\n[Outcome: ${state.stepInfo.actionSuccessful}]\n`);
        break;
      }
      case 'claim_rewards_xyk': {
        console.log(`[${state.numSteps}][CLAIM REWARD XYK]\n[Executor: ${state.stepInfo.msgInfo.sender}]\n[Outcome: ${state.stepInfo.actionSuccessful}]\n`);
        let stateBefore = index==0 ? state : states[--index]
        stateBefore.users.get(state.stepInfo.msgInfo.sender)?.has_xyk_rewards ? console.log("had rewards before") : console.log("didnt have rewards before")
        console.log(stateBefore)
        break;
      }
      case 'claim_rewards_pcl': {
        console.log(`[${state.numSteps}][CLAIM REWARD PCL]\n[Executor: ${state.stepInfo.msgInfo.sender}]\n[Outcome: ${state.stepInfo.actionSuccessful}]\n`)
        break;
      };
      default: {
      }
    }
    index++;
  }
}

// testMatcher()