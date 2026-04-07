import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  generate_bounty_id(context: __compactRuntime.WitnessContext<Ledger, PS>,
                     creator_0: Uint8Array,
                     schema_0: Uint8Array): [PS, Uint8Array];
  compute_similarity_score(context: __compactRuntime.WitnessContext<Ledger, PS>,
                           claimer_schema_0: Uint8Array,
                           required_schema_0: Uint8Array,
                           claimer_data_hash_0: Uint8Array): [PS, bigint];
  get_claimer_identity(context: __compactRuntime.WitnessContext<Ledger, PS>,
                       session_salt_0: Uint8Array): [PS, Uint8Array];
  get_creator_identity(context: __compactRuntime.WitnessContext<Ledger, PS>,
                       session_salt_0: Uint8Array): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  create_bounty(context: __compactRuntime.CircuitContext<PS>,
                session_salt_0: Uint8Array,
                required_schema_hash_0: Uint8Array,
                min_similarity_0: bigint,
                min_row_bucket_0: bigint,
                reward_dust_0: bigint,
                description_hash_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  claim_bounty(context: __compactRuntime.CircuitContext<PS>,
               bounty_id_0: Uint8Array,
               session_salt_0: Uint8Array,
               claimer_schema_hash_0: Uint8Array,
               claimer_data_hash_0: Uint8Array,
               claimer_row_bucket_0: bigint): __compactRuntime.CircuitResults<PS, boolean>;
  get_bounty_info(context: __compactRuntime.CircuitContext<PS>,
                  bounty_id_0: Uint8Array): __compactRuntime.CircuitResults<PS, [Uint8Array,
                                                                                 bigint,
                                                                                 bigint,
                                                                                 bigint]>;
}

export type ProvableCircuits<PS> = {
  create_bounty(context: __compactRuntime.CircuitContext<PS>,
                session_salt_0: Uint8Array,
                required_schema_hash_0: Uint8Array,
                min_similarity_0: bigint,
                min_row_bucket_0: bigint,
                reward_dust_0: bigint,
                description_hash_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  claim_bounty(context: __compactRuntime.CircuitContext<PS>,
               bounty_id_0: Uint8Array,
               session_salt_0: Uint8Array,
               claimer_schema_hash_0: Uint8Array,
               claimer_data_hash_0: Uint8Array,
               claimer_row_bucket_0: bigint): __compactRuntime.CircuitResults<PS, boolean>;
  get_bounty_info(context: __compactRuntime.CircuitContext<PS>,
                  bounty_id_0: Uint8Array): __compactRuntime.CircuitResults<PS, [Uint8Array,
                                                                                 bigint,
                                                                                 bigint,
                                                                                 bigint]>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  create_bounty(context: __compactRuntime.CircuitContext<PS>,
                session_salt_0: Uint8Array,
                required_schema_hash_0: Uint8Array,
                min_similarity_0: bigint,
                min_row_bucket_0: bigint,
                reward_dust_0: bigint,
                description_hash_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  claim_bounty(context: __compactRuntime.CircuitContext<PS>,
               bounty_id_0: Uint8Array,
               session_salt_0: Uint8Array,
               claimer_schema_hash_0: Uint8Array,
               claimer_data_hash_0: Uint8Array,
               claimer_row_bucket_0: bigint): __compactRuntime.CircuitResults<PS, boolean>;
  get_bounty_info(context: __compactRuntime.CircuitContext<PS>,
                  bounty_id_0: Uint8Array): __compactRuntime.CircuitResults<PS, [Uint8Array,
                                                                                 bigint,
                                                                                 bigint,
                                                                                 bigint]>;
}

export type Ledger = {
  bounty_creators: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  bounty_required_schema: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  bounty_min_similarity: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  bounty_min_rows: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  bounty_rewards: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  bounty_status: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  bounty_claimer: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  bounty_description_hash: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  readonly total_bounties: bigint;
  readonly total_claimed: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
