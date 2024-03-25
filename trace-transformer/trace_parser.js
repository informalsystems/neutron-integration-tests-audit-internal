"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllOtherStates = exports.getInitialState = void 0;
var fs = require("fs");
var readStatesFromFile = function () {
    var jsonString = fs.readFileSync('./traces/fullMigrationHappened_trace0.itf.json', 'utf8'); // Replace with your file reading logic
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
var getInitialState = function () {
    var initialState = readStatesFromFile()[0];
    var usersStatesMap = new Map();
    initialState.stepInfo.msgArgs.value["#map"].forEach(function (element) {
        usersStatesMap.set(element[0], { ATOM_locked: element[1].ATOM_locked["#bigint"], NTRN_locked: element[1].NTRN_locked["#bigint"], USDC_locked: element[1].USDC_locked["#bigint"] });
    });
    initialState.stepInfo.msgArgs.value = usersStatesMap;
    return initialState;
};
exports.getInitialState = getInitialState;
var getAllOtherStates = function () { return readStatesFromFile().slice(1); };
exports.getAllOtherStates = getAllOtherStates;
function testMatcher() {
    var _a;
    var index = 0;
    var states = (0, exports.getAllOtherStates)();
    for (var _i = 0, states_1 = states; _i < states_1.length; _i++) {
        var state = states_1[_i];
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
                var stateBefore = index == 0 ? state : states[--index];
                ((_a = stateBefore.users.get(state.stepInfo.msgInfo.sender)) === null || _a === void 0 ? void 0 : _a.has_xyk_rewards) ? console.log("had rewards before") : console.log("didnt have rewards before");
                console.log(stateBefore);
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
        index++;
    }
}
// testMatcher()
