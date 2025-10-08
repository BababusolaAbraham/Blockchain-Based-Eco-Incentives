import { describe, it, expect, beforeEach } from "vitest";
import { uintCV } from "@stacks/transactions";
import { Buffer } from "node:buffer";

const ERR_NOT_AUTHORIZED = 3000;
const ERR_NOT_ORACLE = 3001;
const ERR_EXPIRED_PERIOD = 3003;
const ERR_INVALID_PARCEL_ID = 3004;
const ERR_INVALID_PERIOD = 3005;
const ERR_INVALID_NDVI_SCORE = 3006;
const ERR_ORACLE_ALREADY_ADDED = 3007;
const ERR_ORACLE_NOT_FOUND = 3008;
const ERR_VERIFICATION_ALREADY_EXISTS = 3009;
const ERR_INVALID_ADMIN = 3010;
const ERR_INVALID_HASH_LENGTH = 3011;
const ERR_MAX_ORACLES_EXCEEDED = 3012;
const ERR_INVALID_SUBMISSION_FEE = 3013;
const ERR_INVALID_LOCATION = 3018;
const ERR_INVALID_SATELLITE_SOURCE = 3019;
const ERR_INVALID_CONFIDENCE = 3020;

interface Oracle {
  address: string;
  active: boolean;
  addedAt: number;
  submissions: number;
}

interface Verification {
  proofHash: Buffer;
  ndviScore: number;
  submittedAt: number;
  oracle: string;
  confidence: number;
  satelliteSource: string;
  locationHash: Buffer;
  status: boolean;
}

interface VerificationHistory {
  parcelId: number;
  period: number;
  updateTimestamp: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T | number;
}

class VerificationOracleMock {
  state: {
    admin: string;
    nextOracleId: number;
    maxOracles: number;
    submissionFee: number;
    oracleRegistryContract: string | null;
    oracles: Map<number, Oracle>;
    oraclesByAddress: Map<string, number>;
    verifications: Map<string, Verification>;
    verificationHistory: Map<number, VerificationHistory>;
    oracleSubmissions: Map<string, number>;
  } = {
    admin: "ST1ADMIN",
    nextOracleId: 0,
    maxOracles: 50,
    submissionFee: 100,
    oracleRegistryContract: null,
    oracles: new Map(),
    oraclesByAddress: new Map(),
    verifications: new Map(),
    verificationHistory: new Map(),
    oracleSubmissions: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1CALLER";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      admin: "ST1ADMIN",
      nextOracleId: 0,
      maxOracles: 50,
      submissionFee: 100,
      oracleRegistryContract: null,
      oracles: new Map(),
      oraclesByAddress: new Map(),
      verifications: new Map(),
      verificationHistory: new Map(),
      oracleSubmissions: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1CALLER";
    this.stxTransfers = [];
  }

  getOracle(id: number): Oracle | null {
    return this.state.oracles.get(id) || null;
  }

  getOracleByAddress(address: string): Oracle | null {
    const id = this.state.oraclesByAddress.get(address);
    return id !== undefined ? this.getOracle(id) : null;
  }

  getVerification(parcelId: number, period: number): Verification | null {
    const key = `${parcelId}-${period}`;
    return this.state.verifications.get(key) || null;
  }

  getVerificationHistory(historyId: number): VerificationHistory | null {
    return this.state.verificationHistory.get(historyId) || null;
  }

  getSubmissionCount(oracle: string): number {
    return this.state.oracleSubmissions.get(oracle) || 0;
  }

  isOracleActive(address: string): boolean {
    const oracle = this.getOracleByAddress(address);
    return oracle ? oracle.active : false;
  }

  setAdmin(newAdmin: string): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newAdmin === this.caller) return { ok: false, value: ERR_INVALID_ADMIN };
    this.state.admin = newAdmin;
    return { ok: true, value: true };
  }

  setMaxOracles(newMax: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newMax <= 0) return { ok: false, value: ERR_INVALID_SUBMISSION_FEE };
    this.state.maxOracles = newMax;
    return { ok: true, value: true };
  }

  setSubmissionFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newFee < 0) return { ok: false, value: ERR_INVALID_SUBMISSION_FEE };
    this.state.submissionFee = newFee;
    return { ok: true, value: true };
  }

  setOracleRegistryContract(contractPrincipal: string): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (contractPrincipal === this.caller) return { ok: false, value: ERR_INVALID_ADMIN };
    this.state.oracleRegistryContract = contractPrincipal;
    return { ok: true, value: true };
  }

  addOracle(oracle: string): Result<number> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.nextOracleId >= this.state.maxOracles) return { ok: false, value: ERR_MAX_ORACLES_EXCEEDED };
    if (this.state.oraclesByAddress.has(oracle)) return { ok: false, value: ERR_ORACLE_ALREADY_ADDED };
    const id = this.state.nextOracleId;
    this.state.oracles.set(id, { address: oracle, active: true, addedAt: this.blockHeight, submissions: 0 });
    this.state.oraclesByAddress.set(oracle, id);
    this.state.nextOracleId++;
    return { ok: true, value: id };
  }

  removeOracle(oracle: string): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    const id = this.state.oraclesByAddress.get(oracle);
    if (id === undefined) return { ok: false, value: ERR_ORACLE_NOT_FOUND };
    const details = this.state.oracles.get(id);
    if (details) {
      this.state.oracles.set(id, { ...details, active: false });
      return { ok: true, value: true };
    }
    return { ok: false, value: ERR_ORACLE_NOT_FOUND };
  }

  submitProof(
    parcelId: number,
    period: number,
    proofHash: Buffer,
    ndviScore: number,
    confidence: number,
    satelliteSource: string,
    locationHash: Buffer
  ): Result<boolean> {
    const key = `${parcelId}-${period}`;
    if (!this.isOracleActive(this.caller)) return { ok: false, value: ERR_NOT_ORACLE };
    if (parcelId <= 0) return { ok: false, value: ERR_INVALID_PARCEL_ID };
    if (period <= 0) return { ok: false, value: ERR_INVALID_PERIOD };
    if (proofHash.length !== 32) return { ok: false, value: ERR_INVALID_HASH_LENGTH };
    if (ndviScore < 0 || ndviScore > 10000) return { ok: false, value: ERR_INVALID_NDVI_SCORE };
    if (confidence < 0 || confidence > 100) return { ok: false, value: ERR_INVALID_CONFIDENCE };
    if (!["Planet", "MODIS", "Sentinel"].includes(satelliteSource)) return { ok: false, value: ERR_INVALID_SATELLITE_SOURCE };
    if (locationHash.length !== 32) return { ok: false, value: ERR_INVALID_LOCATION };
    if (period > this.blockHeight - 144) return { ok: false, value: ERR_EXPIRED_PERIOD };
    if (this.state.verifications.has(key)) return { ok: false, value: ERR_VERIFICATION_ALREADY_EXISTS };
    if (this.state.oracleRegistryContract) {
      this.stxTransfers.push({ amount: this.state.submissionFee, from: this.caller, to: this.state.oracleRegistryContract });
    }
    this.state.verifications.set(key, {
      proofHash,
      ndviScore,
      submittedAt: this.blockHeight,
      oracle: this.caller,
      confidence,
      satelliteSource,
      locationHash,
      status: true,
    });
    const currentSubs = this.getSubmissionCount(this.caller);
    this.state.oracleSubmissions.set(this.caller, currentSubs + 1);
    return { ok: true, value: true };
  }

  updateVerificationStatus(parcelId: number, period: number, newStatus: boolean): Result<boolean> {
    const key = `${parcelId}-${period}`;
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    const verif = this.state.verifications.get(key);
    if (!verif) return { ok: false, value: ERR_ORACLE_NOT_FOUND };
    this.state.verifications.set(key, { ...verif, status: newStatus });
    return { ok: true, value: true };
  }

  recordVerificationHistory(parcelId: number, period: number): Result<number> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    const nextHistoryId = this.state.verificationHistory.size;
    this.state.verificationHistory.set(nextHistoryId, {
      parcelId,
      period,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: nextHistoryId };
  }

  getOracleCount(): Result<number> {
    return { ok: true, value: this.state.nextOracleId };
  }
}

describe("VerificationOracle", () => {
  let contract: VerificationOracleMock;

  beforeEach(() => {
    contract = new VerificationOracleMock();
    contract.reset();
  });

  it("adds an oracle successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.addOracle("ST2ORACLE");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const oracle = contract.getOracle(0);
    expect(oracle?.address).toBe("ST2ORACLE");
    expect(oracle?.active).toBe(true);
  });

  it("rejects adding duplicate oracle", () => {
    contract.caller = "ST1ADMIN";
    contract.addOracle("ST2ORACLE");
    const result = contract.addOracle("ST2ORACLE");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ORACLE_ALREADY_ADDED);
  });

  it("rejects adding oracle by non-admin", () => {
    contract.caller = "ST3FAKE";
    const result = contract.addOracle("ST2ORACLE");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("removes an oracle successfully", () => {
    contract.caller = "ST1ADMIN";
    contract.addOracle("ST2ORACLE");
    const result = contract.removeOracle("ST2ORACLE");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const oracle = contract.getOracleByAddress("ST2ORACLE");
    expect(oracle?.active).toBe(false);
  });

  it("rejects removing non-existent oracle", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.removeOracle("ST3FAKE");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ORACLE_NOT_FOUND);
  });

  it("rejects submission by non-oracle", () => {
    contract.caller = "ST3FAKE";
    const proofHash = Buffer.alloc(32);
    const locationHash = Buffer.alloc(32);
    const result = contract.submitProof(1, 100, proofHash, 5000, 90, "Planet", locationHash);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_ORACLE);
  });

  it("rejects invalid ndvi score", () => {
    contract.caller = "ST1ADMIN";
    contract.addOracle("ST2ORACLE");
    contract.caller = "ST2ORACLE";
    const proofHash = Buffer.alloc(32);
    const locationHash = Buffer.alloc(32);
    const result = contract.submitProof(1, 100, proofHash, 10001, 90, "Planet", locationHash);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_NDVI_SCORE);
  });

  it("rejects status update by non-admin", () => {
    contract.caller = "ST3FAKE";
    const result = contract.updateVerificationStatus(1, 100, false);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("records verification history successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.recordVerificationHistory(1, 100);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const history = contract.getVerificationHistory(0);
    expect(history?.parcelId).toBe(1);
    expect(history?.period).toBe(100);
    expect(history?.updater).toBe("ST1ADMIN");
  });

  it("rejects history record by non-admin", () => {
    contract.caller = "ST3FAKE";
    const result = contract.recordVerificationHistory(1, 100);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets submission fee successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setSubmissionFee(200);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.submissionFee).toBe(200);
  });

  it("rejects invalid submission fee", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setSubmissionFee(-1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_SUBMISSION_FEE);
  });

  it("gets oracle count correctly", () => {
    contract.caller = "ST1ADMIN";
    contract.addOracle("ST2ORACLE1");
    contract.addOracle("ST2ORACLE2");
    const result = contract.getOracleCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("parses uint parameters with Clarity types", () => {
    const parcelId = uintCV(1);
    const period = uintCV(100);
    expect(parcelId.value).toEqual(BigInt(1));
    expect(period.value).toEqual(BigInt(100));
  });

  it("rejects max oracles exceeded", () => {
    contract.caller = "ST1ADMIN";
    contract.state.maxOracles = 1;
    contract.addOracle("ST2ORACLE1");
    const result = contract.addOracle("ST2ORACLE2");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_ORACLES_EXCEEDED);
  });

  it("sets admin successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setAdmin("ST4NEWADMIN");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.admin).toBe("ST4NEWADMIN");
  });

  it("rejects invalid admin set", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setAdmin("ST1ADMIN");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ADMIN);
  });
});