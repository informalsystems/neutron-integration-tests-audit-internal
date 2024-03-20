import * as fs from 'fs';
import { Trace, State, User, ReadingState, ReadingTrace } from "./structs";


const readStatesFromFile = () : State[] => {
  const jsonString = fs.readFileSync('trace.json', 'utf8'); // Replace with your file reading logic
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

export const getInitialState = () : State => readStatesFromFile()[0];
export const getAllOtherStates = () : State[] => readStatesFromFile().slice(1);

function testMatcher() {
  for(let state of readStatesFromFile()){
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
        break;
      }
      case 'claim_rewards_pcl': {
        console.log(`[${state.numSteps}][CLAIM REWARD PCL]\n[Executor: ${state.stepInfo.msgInfo.sender}]\n[Outcome: ${state.stepInfo.actionSuccessful}]\n`)
        break;
      };
      default: {
      }
    }
  }
}



