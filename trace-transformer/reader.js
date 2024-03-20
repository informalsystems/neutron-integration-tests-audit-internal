"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("fs");
var readStatesFromFile = function () {
    var jsonString = fs.readFileSync('trace.json', 'utf8'); // Replace with your file reading logic
    var data = JSON.parse(jsonString);
    var reading_states = data.states;
    var states = [];
    reading_states.forEach(function (v) {
        var users_map = new Map();
        v.users["#map"].forEach(function (element) {
            users_map.set(element[0], element[1]);
        });
        states.push({ stepInfo: v.stepInfo, users: users_map, numSteps: v.numSteps['#bigint'] });
    });
    return states;
};
function testMatcher() {
    for (var _i = 0, _a = readStatesFromFile(); _i < _a.length; _i++) {
        var state = _a[_i];
        switch (state.stepInfo.actionTaken) {
            case 'advance_block': {
                console.log("[".concat(state.numSteps, "][ADVANCE BLOCK]"));
                break;
            }
            case 'migrate': {
                console.log("[".concat(state.numSteps, "][MIGRATE]\n[Executor: ").concat(state.stepInfo.msgInfo.sender, "]\n[Outcome: ").concat(state.stepInfo.actionSuccessful, "]\n"));
                break;
            }
            case 'claim_rewards_xyk': {
                console.log("[".concat(state.numSteps, "][CLAIM REWARD XYK]\n[Executor: ").concat(state.stepInfo.msgInfo.sender, "]\n[Outcome: ").concat(state.stepInfo.actionSuccessful, "]\n"));
                break;
            }
            case 'claim_rewards_pcl':
                {
                    console.log("[".concat(state.numSteps, "][CLAIM REWARD PCL]\n[Executor: ").concat(state.stepInfo.msgInfo.sender, "]\n[Outcome: ").concat(state.stepInfo.actionSuccessful, "]\n"));
                    break;
                }
                ;
            default: {
            }
        }
    }
}
testMatcher();
