import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  compute_audit_id(context: __compactRuntime.WitnessContext<Ledger, PS>,
                   session_commitment_0: Uint8Array,
                   fingerprint_0: Uint8Array): [PS, Uint8Array];
  compute_pipeline_hash(context: __compactRuntime.WitnessContext<Ledger, PS>,
                        operations_0: Uint8Array[],
                        parameters_0: Uint8Array): [PS, Uint8Array];
  verify_data_integrity(context: __compactRuntime.WitnessContext<Ledger, PS>,
                        data_hash_0: Uint8Array,
                        pipeline_hash_0: Uint8Array,
                        expected_output_hash_0: Uint8Array): [PS, [Uint8Array,
                                                                   boolean]];
  get_session_commitment(context: __compactRuntime.WitnessContext<Ledger, PS>,
                         session_salt_0: Uint8Array): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  submit_audit(context: __compactRuntime.CircuitContext<PS>,
               session_salt_0: Uint8Array,
               fingerprint_commitment_0: Uint8Array,
               operations_0: Uint8Array[],
               parameters_0: Uint8Array,
               expected_output_hash_0: Uint8Array,
               attestation_type_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  verify_audit(context: __compactRuntime.CircuitContext<PS>,
               audit_id_0: Uint8Array): __compactRuntime.CircuitResults<PS, [boolean,
                                                                             Uint8Array,
                                                                             Uint8Array,
                                                                             bigint]>;
}

export type ProvableCircuits<PS> = {
  submit_audit(context: __compactRuntime.CircuitContext<PS>,
               session_salt_0: Uint8Array,
               fingerprint_commitment_0: Uint8Array,
               operations_0: Uint8Array[],
               parameters_0: Uint8Array,
               expected_output_hash_0: Uint8Array,
               attestation_type_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  verify_audit(context: __compactRuntime.CircuitContext<PS>,
               audit_id_0: Uint8Array): __compactRuntime.CircuitResults<PS, [boolean,
                                                                             Uint8Array,
                                                                             Uint8Array,
                                                                             bigint]>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  submit_audit(context: __compactRuntime.CircuitContext<PS>,
               session_salt_0: Uint8Array,
               fingerprint_commitment_0: Uint8Array,
               operations_0: Uint8Array[],
               parameters_0: Uint8Array,
               expected_output_hash_0: Uint8Array,
               attestation_type_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  verify_audit(context: __compactRuntime.CircuitContext<PS>,
               audit_id_0: Uint8Array): __compactRuntime.CircuitResults<PS, [boolean,
                                                                             Uint8Array,
                                                                             Uint8Array,
                                                                             bigint]>;
}

export type Ledger = {
  audit_sessions: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  audit_fingerprints: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  audit_pipeline_hashes: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  audit_integrity_proofs: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  audit_verified: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<[Uint8Array, boolean]>
  };
  audit_attestation_type: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  readonly total_audits: bigint;
  readonly total_verified: bigint;
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
