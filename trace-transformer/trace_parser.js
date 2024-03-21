"use strict";
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllOtherStates = exports.getInitialState = void 0;
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
    var e_1, _a;
    try {
        for (var _b = __values(readStatesFromFile()), _c = _b.next(); !_c.done; _c = _b.next()) {
            var state = _c.value;
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
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
        }
        finally { if (e_1) throw e_1.error; }
    }
}
// function testloading(){
//   let data = getInitialState().stepInfo.msgArgs.value;
//   for (const [key, value] of Object.entries(data)) {
//     console.log(key);
//   }
//   for (const [key, value] of data.entries()) {
//     console.log(key, value);
//   }
//   for(let a in data.keys()){
//     console.log(a)
//     console.log(data.get(a))
//   }
//   for(const key of data.keys()){
//     console.log(key)
//     console.log(data.get(key))
//   }
// }
function testloading() {
    var e_2, _a;
    var data = (0, exports.getInitialState)().stepInfo.msgArgs.value;
    console.log(data.keys());
    try {
        // Iterate through Map entries using for...of with destructuring
        // for (const [key, value] in data.entries()) {
        //   console.log("Key:", key);
        //   console.log("Value:", value);
        // }
        // Iterate through Map entries using for...in (less recommended)
        for (var _b = __values(data.keys()), _c = _b.next(); !_c.done; _c = _b.next()) {
            var key = _c.value;
            console.log("Key:", key);
            console.log("Value:", data.get(key)); // Get value using key
        }
    }
    catch (e_2_1) { e_2 = { error: e_2_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
        }
        finally { if (e_2) throw e_2.error; }
    }
}
testloading();
