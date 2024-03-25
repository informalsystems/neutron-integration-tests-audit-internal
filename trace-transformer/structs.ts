export interface BigIntWrapper {
  "#bigint": number;
}

export interface User {
  has_xyk_rewards: boolean;
  has_pcl_rewards: boolean;
  migrated: boolean;
  only_vesting: boolean;
  pcl_liquidity_withdrawn: boolean;
  xyk_liquidity_withdrawn: boolean;
}

export interface MsgArgs {
  tag: string;
  value: any; // Can be more specific based on actual data types
}
export interface InitAmounts {
  ATOM_locked: number;
  NTRN_locked: number;
  USDC_locked: number;
} 
export interface MsgInfo {
  sender: string;
}

export interface StepInfo {
  actionErrorDescription: string;
  actionSuccessful: boolean;
  actionTaken: string;
  msgArgs: MsgArgs;
  msgInfo: MsgInfo;
}

export interface ReadingState {
  "#meta": { index: number };
  numSteps: BigIntWrapper;
  stepInfo: StepInfo;
  users: {  "#map" : UserEntry[] };
}
export interface State {
  numSteps: number;
  stepInfo: StepInfo;
  users: Map<string, User> 
}
export interface InitialStepInfo {
  actionErrorDescription: string;
  actionSuccessful: boolean;
  actionTaken: string;
  msgArgs: MsgArgs;
  msgInfo: MsgInfo;
}
export interface InitialState {
  numSteps: number;
  stepInfo: InitialStepInfo;
  users: Map<string, User> 
}

export interface UserEntry {
  [key: string]: User | string; // Can be username (string) or user data (object)
}

export interface ReadingTrace {
  "#meta": {
    format: string;
    "format-description": string;
    source: string;
    status: string;
    description: string;
    timestamp: number;
  };
  vars: string[];
  states: ReadingState[];
}


export interface Trace {
  "#meta": {
    format: string;
    "format-description": string;
    source: string;
    status: string;
    description: string;
    timestamp: number;
  };
  vars: string[];
  states: State[];
}