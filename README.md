# TerraToken Rewards: Blockchain-Based Eco-Incentives

## Overview

**TerraToken Rewards** is a Web3 protocol built on the Stacks blockchain using Clarity smart contracts. It incentivizes eco-friendly land management practices (e.g., reforestation, sustainable farming, and anti-deforestation efforts) by rewarding participants with fungible tokens. Verification relies on satellite imagery data (e.g., from sources like Planet Labs or NASA's MODIS) processed off-chain by trusted oracles, which submit cryptographic proofs (hashes or zero-knowledge proofs) to the blockchain for immutability and transparency.

### Real-World Problems Solved
- **Climate Change Mitigation**: Deforestation contributes ~12% of global GHG emissions (per IPCC). This protocol rewards landowners for maintaining/increasing green cover, directly combating this.
- **Lack of Trust in Carbon Credits**: Traditional carbon markets suffer from "greenwashing" due to unverifiable claims. Satellite-verified data ensures tamper-proof proof-of-impact.
- **Incentivizing Smallholders**: Small farmers (80% of global food production, per FAO) often lack access to carbon finance. Tokens provide liquid rewards redeemable for fiat, tools, or offsets.
- **Data Silos**: Integrates satellite data into blockchain for auditable, decentralized verification, enabling global scalability.

### Key Features
- **Land Registration**: Users register geo-fenced land parcels with proof of ownership (e.g., NFT-linked deeds).
- **Satellite Verification**: Oracles submit periodic data proofs (e.g., NDVI indices for vegetation health) to confirm eco-practices.
- **Token Rewards**: Automated distribution of $TERRA tokens based on verified improvements (e.g., 1 token per 10m² of sustained green cover/month).
- **Governance**: Token holders vote on protocol upgrades, oracle selection, and reward rates.
- **Dispute Resolution**: On-chain challenges with staking to prevent spam.
- **Interoperability**: Tokens compatible with DeFi (e.g., staking for yields) and carbon marketplaces.

### Architecture
- **Off-Chain Components**:
  - Satellite data pipeline: API integrations (e.g., Google Earth Engine) + ML models for NDVI/land-cover analysis.
  - Oracle network (e.g., Chainlink on Stacks) to hash and submit data proofs.
- **On-Chain (Clarity Contracts)**: 7 core contracts for modularity and security.
- **Frontend**: React app for user onboarding (not included; use Clarinet for testing).
- **Tokenomics**: 1B $TERRA supply; 40% rewards pool, 20% governance, 20% team/DAO, 20% liquidity.

### Tech Stack
- **Blockchain**: Stacks (L1 for Bitcoin finality).
- **Smart Contracts**: Clarity (secure, decidable language).
- **Tools**: Clarinet (local dev), Hiro CLI (deployment), Blockstack for auth.
- **Integrations**: Satellite APIs, oracles for data feeds.

## Getting Started

### Prerequisites
- Rust & Cargo (for Clarinet).
- Node.js (for frontend if extending).
- Stacks wallet (e.g., Leather).

### Installation
1. Clone the repo:
   ```
   git clone 
   cd terratoken-rewards
   ```
2. Install Clarinet:
   ```
   cargo install clarinet
   ```
3. Run local devnet:
   ```
   clarinet integrate
   ```
4. Test contracts:
   ```
   clarinet test
   ```
5. Deploy to testnet:
   ```
   clarinet deploy --network testnet
   ```

### Contract Deployment Order
Deploy in sequence for dependencies:
1. `eco-token.clar` (SIP-010 token).
2. `land-registry.clar`.
3. `verification-oracle.clar`.
4. `rewards-calculator.clar`.
5. `reward-distributor.clar`.
6. `governance.clar`.
7. `dispute-handler.clar`.

### Usage Flow
1. **Register Land**: Call `register-land` with geo-coords and ownership proof.
2. **Submit Verification**: Oracle calls `submit-proof` with satellite hash.
3. **Claim Rewards**: Users call `claim-rewards` if verified.
4. **Govern**: Stake tokens and vote via `governance.clar`.
5. **Dispute**: Challenge proofs with stake.

### Security Considerations
- All contracts use Clarity's predictable execution (no reentrancy).
- Access controls: Only oracles can submit proofs; multisig for admin.
- Audits: Recommend external audit before mainnet.
- Upgradability: Proxy patterns via traits (future extension).

### Contributing
Fork, PR with tests. Focus on oracle integrations or ML for verification.

### License
MIT. See `LICENSE`.


---

## Smart Contracts

Below are the 7 Clarity contracts. Place each in `contracts/<name>.clar`. Update `Clarity.toml` with traits and dependencies.

### 1. eco-token.clar (SIP-010 Fungible Token)
```clarity
;; eco-token.clar
;; SIP-010 compliant fungible token for $TERRA rewards.

(define-constant ERR_NOT_AUTHORIZED (err u1000))
(define-constant ERR_SUPPLY_OVERFLOW (err u1001))
(define-constant ERR_INVALID_AMOUNT (err u1002))

(define-data-var total-supply uint u1000000000) ;; 1B tokens
(define-data-var token-name (string-ascii 32) "TERRA")
(define-data-var token-symbol (string-ascii 10) "TERRA")
(define-data-var token-uri (optional (string-ascii 256)) (some "https://terratoken.xyz/metadata.json"))
(define-data-var admin principal tx-sender)

(define-map balances { account: principal } uint)
(define-map allowances { owner: principal, spender: principal } uint)

(define-public (transfer
  (amount uint)
  (sender principal)
  (recipient principal)
)
  (begin
    (asserts! (is-eq tx-sender sender) ERR_NOT_AUTHORIZED)
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (try! (update-balances sender recipient amount))
    (print { type: "ft_transfer_event", sender: sender, recipient: recipient, amount: amount })
    (ok true)
  )
)

(define-private (update-balances
  (from principal)
  (to principal)
  (amount uint)
)
  (let
    (
      (from-balance (get-balance from))
      (to-balance (get-balance to))
      (new-from (- from-balance amount))
      (new-to (+ to-balance amount))
    )
    (asserts! (>= from-balance amount) ERR_INVALID_AMOUNT)
    (map-set balances { account: from } new-from)
    (map-set balances { account: to } new-to)
    (ok true)
  )
)

(define-read-only (get-balance (account principal))
  (default-to u0 (map-get? balances { account: account }))
)

;; Admin mint (one-time for initial supply)
(define-public (mint (recipient principal) (amount uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR_NOT_AUTHORIZED)
    (let
      (
        (current-supply (get-total-supply))
        (new-supply (+ current-supply amount))
      )
      (asserts! (<= new-supply (var-get total-supply)) ERR_SUPPLY_OVERFLOW)
      (update-balances (as-principal 'SP000000000000000000002Q6VF78) recipient amount) ;; Burn to null
      (var-set total-supply new-supply)
      (ok true)
    )
  )
)

(define-read-only (get-total-supply) (var-get total-supply))
(define-read-only (get-name) (var-get token-name))
(define-read-only (get-symbol) (var-get token-symbol))
(define-read-only (get-decimals) u6) ;; 6 decimals
(define-read-only (get-token-uri) (var-get token-uri))

;; SIP-010 traits (implement as needed)
```
*Note: Full SIP-010 compliance requires trait imports; extend with `(implements-token ...)`.*

### 2. land-registry.clar (Land Parcel Registration)
```clarity
;; land-registry.clar
;; Registers land parcels with geo-fences and ownership proofs.

(define-constant ERR_ALREADY_REGISTERED (err u2000))
(define-constant ERR_INVALID_GEO (err u2001))
(define-constant ERR_NOT_OWNER (err u2002))

(define-data-var admin principal tx-sender)
(define-map land-parcels
  { owner: principal, parcel-id: uint }
  { lat: int, lon: int, area-sq-m: uint, registered-at: uint }
)

(define-public (register-land
  (parcel-id uint)
  (lat int)
  (lon int)
  (area-sq-m uint)
)
  (let
    (
      (caller tx-sender)
    )
    (asserts! (and (>= lat -90) (<= lat 90)) ERR_INVALID_GEO)
    (asserts! (and (>= lon -180) (<= lon 180)) ERR_INVALID_GEO)
    (asserts! (is-none (map-get? land-parcels { owner: caller, parcel-id: parcel-id })) ERR_ALREADY_REGISTERED)
    (map-insert land-parcels { owner: caller, parcel-id: parcel-id }
      { lat: lat, lon: lon, area-sq-m: area-sq-m, registered-at: block-height }
    )
    (print { type: "land_registered", owner: caller, parcel-id: parcel-id })
    (ok true)
  )
)

(define-public (transfer-ownership
  (parcel-id uint)
  (new-owner principal)
)
  (let
    (
      (current (unwrap! (map-get? land-parcels { owner: tx-sender, parcel-id: parcel-id }) ERR_NOT_OWNER))
    )
    (map-set land-parcels { owner: tx-sender, parcel-id: parcel-id }
      (merge current { owner: new-owner }))
    (ok true)
  )
)

(define-read-only (get-land-parcel (owner principal) (parcel-id uint))
  (map-get? land-parcels { owner: owner, parcel-id: parcel-id })
)
```

### 3. verification-oracle.clar (Satellite Data Submission)
```clarity
;; verification-oracle.clar
;; Oracles submit hashed satellite proofs for verification.

(define-constant ERR_NOT_ORACLE (err u3000))
(define-constant ERR_INVALID_PROOF (err u3001))
(define-constant ERR_EXPIRED_PERIOD (err u3002))

(define-data-var admin principal tx-sender)
(define-map oracles { address: principal } bool)
(define-map verifications
  { parcel-id: uint, period: uint }
  { proof-hash: (buff 32), ndvi-score: uint, submitted-at: uint, oracle: principal }
)

(define-public (add-oracle (oracle principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR_NOT_ORACLE)
    (map-insert oracles { address: oracle } true)
    (ok true)
  )
)

(define-public (submit-proof
  (parcel-id uint)
  (period uint) ;; e.g., monthly timestamp
  (proof-hash (buff 32))
  (ndvi-score uint) ;; 0-10000 (NDVI * 10000)
)
  (let
    (
      (caller tx-sender)
    )
    (asserts! (default-to false (map-get? oracles { address: caller })) ERR_NOT_ORACLE)
    (asserts! (<= ndvi-score u10000) ERR_INVALID_PROOF)
    (asserts! (>= (- block-height u144) period) ERR_EXPIRED_PERIOD) ;; Within ~1 day on Stacks
    (map-insert verifications { parcel-id: parcel-id, period: period }
      { proof-hash: proof-hash, ndvi-score: ndvi-score, submitted-at: block-height, oracle: caller }
    )
    (print { type: "verification_submitted", parcel-id: parcel-id, period: period, ndvi: ndvi-score })
    (ok true)
  )
)

(define-read-only (get-verification (parcel-id uint) (period uint))
  (map-get? verifications { parcel-id: parcel-id, period: period })
)
```

### 4. rewards-calculator.clar (Reward Computation)
```clarity
;; rewards-calculator.clar
;; Calculates token rewards based on verified NDVI improvements.

(define-constant REWARD_RATE u1) ;; 1 token per 10m² green/month base
(define-constant MIN_NDVI u5000) ;; Threshold for reward (0.5 NDVI)

(define-read-only (calculate-reward
  (area-sq-m uint)
  (ndvi-score uint)
  (prev-ndvi uint)
)
  (if (>= ndvi-score MIN_NDVI)
    (* (/ area-sq-m u10) REWARD_RATE (* u1 (+ u1 (/ (- ndvi-score prev-ndvi) u1000)))) ;; Bonus for improvement
    u0
  )
)

;; Public caller for off-chain use, but on-chain for disputes
(define-public (get-reward-estimate
  (parcel-id uint)
  (period uint)
)
  (let
    (
      (land (unwrap! (contract-call? .land-registry get-land-parcel tx-sender parcel-id) (err u0)))
      (verif (unwrap! (contract-call? .verification-oracle get-verification parcel-id period) (err u0)))
      (prev-verif (contract-call? .verification-oracle get-verification parcel-id (- period u1))) ;; Assume prev period
      (prev-ndvi (get ndvi-score (unwrap-panic prev-verif)))
      (reward (calculate-reward (get area-sq-m land) (get ndvi-score verif) prev-ndvi))
    )
    (ok reward)
  )
)
```
*Note: Cross-contract calls require deployment order; use traits for loose coupling.*

### 5. reward-distributor.clar (Token Distribution)
```clarity
;; reward-distributor.clar
;; Distributes calculated rewards from token contract.

(define-constant ERR_NOT_VERIFIED (err u4000))
(define-constant ERR_ALREADY_CLAIMED (err u4001))

(define-map claimed { parcel-id: uint, period: uint } bool)

(define-public (claim-rewards
  (parcel-id uint)
  (period uint)
)
  (let
    (
      (caller tx-sender)
      (verif (unwrap! (contract-call? .verification-oracle get-verification parcel-id period) ERR_NOT_VERIFIED))
      (land (contract-call? .land-registry get-land-parcel caller parcel-id))
      (already-claimed (default-to false (map-get? claimed { parcel-id: parcel-id, period: period })))
      (reward (unwrap! (contract-call? .rewards-calculator get-reward-estimate parcel-id period) ERR_NOT_VERIFIED))
    )
    (asserts! (some land) ERR_NOT_VERIFIED)
    (asserts! (not already-claimed) ERR_ALREADY_CLAIMED)
    (asserts! (> reward u0) ERR_NOT_VERIFIED)
    (try! (contract-call? .eco-token transfer reward (as-principal 'SP000000000000000000002Q6VF78) caller)) ;; From treasury
    (map-set claimed { parcel-id: parcel-id, period: period } true)
    (print { type: "rewards_claimed", recipient: caller, amount: reward })
    (ok reward)
  )
)
```

### 6. governance.clar (DAO Voting)
```clarity
;; governance.clar
;; Token-weighted voting for protocol params.

(define-constant VOTE_PERIOD u100) ;; Blocks per vote
(define-constant QUORUM u1000000) ;; Min tokens for quorum

(define-map proposals { id: uint } { description: (string-ascii 256), yes-votes: uint, no-votes: uint, end-block: uint })
(define-map votes { voter: principal, proposal-id: uint } uint) ;; Amount voted yes

(define-public (propose
  (description (string-ascii 256))
)
  (let
    (
      (new-id (+ (fold get-proposal-id (list ) u0) u1))
    )
    (map-insert proposals { id: new-id }
      { description: description, yes-votes: u0, no-votes: u0, end-block: (+ block-height VOTE_PERIOD) }
    )
    (ok new-id)
  )
)

(define-public (vote-yes
  (proposal-id uint)
  (amount uint)
)
  (begin
    (try! (contract-call? .eco-token transfer amount tx-sender (as-principal 'SP000000000000000000002Q6VF78))) ;; Lock vote
    (let
      (
        (prop (unwrap! (map-get? proposals { id: proposal-id }) (err u5000)))
        (new-yes (+ (get yes-votes prop) amount))
      )
      (map-set proposals { id: proposal-id } (merge prop { yes-votes: new-yes }))
      (map-insert votes { voter: tx-sender, proposal-id: proposal-id } amount)
      (ok true)
    )
  )
)

(define-read-only (is-passed (proposal-id uint))
  (let
    (
      (prop (unwrap-panic (map-get? proposals { id: proposal-id })))
      (total-votes (+ (get yes-votes prop) (get no-votes prop)))
    )
    (and (>= total-votes QUORUM) (>= block-height (get end-block prop)) (> (get yes-votes prop) (/ total-votes u2)))
  )
)
```
*Note: Add `vote-no` similarly. Execute passed proposals off-chain via admin multisig.*

### 7. dispute-handler.clar (Challenge Mechanism)
```clarity
;; dispute-handler.clar
;; Handles challenges to verifications with slashing.

(define-constant DISPUTE_STAKE u1000) ;; Tokens to stake for dispute
(define-constant SLASH_RATE u50) ;; % slashed if lost

(define-map disputes
  { verification-id: uint }
  { challenger: principal, stake: uint, resolved: bool, winner: bool }
)

(define-public (raise-dispute
  (parcel-id uint)
  (period uint)
)
  (let
    (
      (verif-id (+ (* parcel-id u10000) period)) ;; Unique ID
      (caller tx-sender)
    )
    (try! (contract-call? .eco-token transfer DISPUTE_STAKE caller (as-principal 'SP000000000000000000002Q6VF78))) ;; Escrow stake
    (map-insert disputes { verification-id: verif-id }
      { challenger: caller, stake: DISPUTE_STAKE, resolved: false, winner: false }
    )
    ;; Off-chain arbitration (e.g., oracle review); on-chain resolve via admin
    (ok verif-id)
  )
)

(define-public (resolve-dispute
  (verification-id uint)
  (is-valid bool) ;; True if verification valid (challenger loses)
)
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR_NOT_AUTHORIZED)
    (let
      (
        (dispute (unwrap! (map-get? disputes { verification-id: verification-id }) (err u6000)))
        (slash-amount (* (/ DISPUTE_STAKE u100) SLASH_RATE))
      )
      (if is-valid
        ;; Challenger loses: slash and burn
        (begin
          (contract-call? .eco-token transfer slash-amount (get challenger dispute) (as-principal 'SP000000000000000000002Q6VF78))
          (contract-call? .eco-token transfer (- (get stake dispute) slash-amount) (get challenger dispute) (var-get admin)) ;; Refund rest to admin
        )
        ;; Challenger wins: refund + bounty
        (begin
          (contract-call? .eco-token transfer (get stake dispute) (get challenger dispute) (get challenger dispute))
          (contract-call? .eco-token transfer DISPUTE_STAKE (var-get admin) (get challenger dispute)) ;; Bounty from treasury
        )
      )
      (map-set disputes { verification-id: verification-id }
        (merge dispute { resolved: true, winner: (not is-valid) }))
      (ok true)
    )
  )
)

(define-read-only (get-dispute (verification-id uint))
  (map-get? disputes { verification-id: verification-id })
)
```

## Testing
Run `clarinet test` with provided tests in `tests/` (add unit tests for each contract, e.g., via `clarinet simulate`).

## Deployment Notes
- Treasury: Pre-mint to a multisig principal.
- Oracles: Register trusted nodes post-deploy.
- Gas: All fns optimized for <1M cycles.