import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  get_session_identity(context: __compactRuntime.WitnessContext<Ledger, PS>,
                       session_salt_0: Uint8Array): [PS, Uint8Array];
  compute_commit_id(context: __compactRuntime.WitnessContext<Ledger, PS>,
                    parent_id_0: Uint8Array,
                    state_hash_0: Uint8Array,
                    op_hash_0: Uint8Array): [PS, Uint8Array];
  verify_transformation(context: __compactRuntime.WitnessContext<Ledger, PS>,
                        parent_state_hash_0: Uint8Array,
                        child_state_hash_0: Uint8Array,
                        operation_hash_0: Uint8Array): [PS, boolean];
}

export type ImpureCircuits<PS> = {
  record_lineage(context: __compactRuntime.CircuitContext<PS>,
                 session_salt_0: Uint8Array,
                 is_root_0: boolean,
                 parent_id_0: Uint8Array,
                 child_hash_0: Uint8Array,
                 operation_hash_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  get_provenance_info(context: __compactRuntime.CircuitContext<PS>,
                      commit_id_0: Uint8Array): __compactRuntime.CircuitResults<PS, [Uint8Array,
                                                                                     Uint8Array,
                                                                                     Uint8Array]>;
}

export type ProvableCircuits<PS> = {
  record_lineage(context: __compactRuntime.CircuitContext<PS>,
                 session_salt_0: Uint8Array,
                 is_root_0: boolean,
                 parent_id_0: Uint8Array,
                 child_hash_0: Uint8Array,
                 operation_hash_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  get_provenance_info(context: __compactRuntime.CircuitContext<PS>,
                      commit_id_0: Uint8Array): __compactRuntime.CircuitResults<PS, [Uint8Array,
                                                                                     Uint8Array,
                                                                                     Uint8Array]>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  record_lineage(context: __compactRuntime.CircuitContext<PS>,
                 session_salt_0: Uint8Array,
                 is_root_0: boolean,
                 parent_id_0: Uint8Array,
                 child_hash_0: Uint8Array,
                 operation_hash_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  get_provenance_info(context: __compactRuntime.CircuitContext<PS>,
                      commit_id_0: Uint8Array): __compactRuntime.CircuitResults<PS, [Uint8Array,
                                                                                     Uint8Array,
                                                                                     Uint8Array]>;
}

export type Ledger = {
  lineage_parents: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  lineage_state_hashes: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  lineage_owners: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  lineage_operations: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  readonly total_commits: bigint;
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
