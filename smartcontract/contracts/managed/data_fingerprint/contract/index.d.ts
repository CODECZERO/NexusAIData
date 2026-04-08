import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  get_dataset_commitment(context: __compactRuntime.WitnessContext<Ledger, PS>,
                         column_names_0: Uint8Array[],
                         row_count_0: bigint,
                         data_hash_0: Uint8Array): [PS, Uint8Array];
  get_owner_identity(context: __compactRuntime.WitnessContext<Ledger, PS>,
                     session_salt_0: Uint8Array): [PS, Uint8Array];
  compute_schema_hash(context: __compactRuntime.WitnessContext<Ledger, PS>,
                      column_names_0: Uint8Array[]): [PS, Uint8Array];
  compute_fingerprint_id(context: __compactRuntime.WitnessContext<Ledger, PS>,
                         commitment_0: Uint8Array,
                         owner_0: Uint8Array): [PS, Uint8Array];
  get_row_bucket(context: __compactRuntime.WitnessContext<Ledger, PS>,
                 row_count_0: bigint): [PS, bigint];
}

export type ImpureCircuits<PS> = {
  register_fingerprint(context: __compactRuntime.CircuitContext<PS>,
                       column_names_0: Uint8Array[],
                       row_count_0: bigint,
                       data_hash_0: Uint8Array,
                       session_salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  verify_ownership(context: __compactRuntime.CircuitContext<PS>,
                   fingerprint_id_0: Uint8Array,
                   session_salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  get_fingerprint_info(context: __compactRuntime.CircuitContext<PS>,
                       fingerprint_id_0: Uint8Array): __compactRuntime.CircuitResults<PS, [Uint8Array,
                                                                                           Uint8Array,
                                                                                           bigint]>;
}

export type ProvableCircuits<PS> = {
  register_fingerprint(context: __compactRuntime.CircuitContext<PS>,
                       column_names_0: Uint8Array[],
                       row_count_0: bigint,
                       data_hash_0: Uint8Array,
                       session_salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  verify_ownership(context: __compactRuntime.CircuitContext<PS>,
                   fingerprint_id_0: Uint8Array,
                   session_salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  get_fingerprint_info(context: __compactRuntime.CircuitContext<PS>,
                       fingerprint_id_0: Uint8Array): __compactRuntime.CircuitResults<PS, [Uint8Array,
                                                                                           Uint8Array,
                                                                                           bigint]>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  register_fingerprint(context: __compactRuntime.CircuitContext<PS>,
                       column_names_0: Uint8Array[],
                       row_count_0: bigint,
                       data_hash_0: Uint8Array,
                       session_salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  verify_ownership(context: __compactRuntime.CircuitContext<PS>,
                   fingerprint_id_0: Uint8Array,
                   session_salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  get_fingerprint_info(context: __compactRuntime.CircuitContext<PS>,
                       fingerprint_id_0: Uint8Array): __compactRuntime.CircuitResults<PS, [Uint8Array,
                                                                                           Uint8Array,
                                                                                           bigint]>;
}

export type Ledger = {
  fingerprints: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  owners: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  schema_hashes: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  row_buckets: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  is_registered: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<[Uint8Array, boolean]>
  };
  readonly total_registered: bigint;
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
