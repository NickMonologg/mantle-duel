// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MantleDuel — Human vs AI on-chain prediction duel
/// @notice Built for the Mantle "Turing Test" Hackathon 2026 (theme: Human vs AI).
///         Each round, a human predicts whether an asset goes UP or DOWN, while an
///         autonomous AI agent commits ITS OWN prediction + reasoning on-chain. The
///         round is resolved against the real market price and a permanent
///         "Humans vs Machines" scoreboard is kept on Mantle.
contract MantleDuel {
    enum Direction { None, Up, Down }   // None=0, Up=1, Down=2
    enum Outcome   { Pending, Up, Down } // Pending=0, Up=1, Down=2

    struct Round {
        string    asset;        // e.g. "BTC", "MNT"
        int256    startPrice;   // scaled 1e8
        int256    endPrice;     // scaled 1e8
        uint64    startTime;
        uint64    lockTime;     // predictions accepted until lockTime
        uint64    resolveTime;  // suggested resolve time
        Direction aiPrediction; // AI agent's on-chain inference
        string    aiReasoning;  // AI agent's reasoning, stored on-chain
        Outcome   outcome;
        bool      resolved;
        uint32    humanUp;
        uint32    humanDown;
    }

    address public owner;       // keeper (creates & resolves rounds)
    address public aiAgent;     // AI agent identity (commits AI predictions)
    uint256 public roundCount;

    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(address => Direction)) public userPrediction;
    mapping(uint256 => mapping(address => bool)) public settled;

    // Global "Humans vs Machines" scoreboard
    uint256 public humanWins;
    uint256 public aiWins;
    uint256 public ties;

    struct Stat { uint32 played; uint32 correct; uint32 beatAi; }
    mapping(address => Stat) public stats;

    event RoundCreated(uint256 indexed id, string asset, int256 startPrice, uint64 lockTime, uint64 resolveTime);
    event AiCommitted(uint256 indexed id, Direction prediction, string reasoning);
    event Predicted(uint256 indexed id, address indexed user, Direction prediction);
    event Resolved(uint256 indexed id, int256 endPrice, Outcome outcome, bool aiCorrect);
    event Settled(uint256 indexed id, address indexed user, bool correct, bool beatAi);
    event AiAgentChanged(address indexed agent);

    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
    modifier onlyAgent() { require(msg.sender == aiAgent, "not agent"); _; }

    constructor(address _aiAgent) {
        owner = msg.sender;
        aiAgent = _aiAgent == address(0) ? msg.sender : _aiAgent;
    }

    function setAiAgent(address a) external onlyOwner {
        aiAgent = a;
        emit AiAgentChanged(a);
    }

    /// @notice Keeper opens a new duel round at the current market price.
    function createRound(
        string calldata asset,
        int256 startPrice,
        uint64 lockDuration,
        uint64 resolveDuration
    ) external onlyOwner returns (uint256 id) {
        require(lockDuration > 0 && resolveDuration >= lockDuration, "bad durations");
        id = ++roundCount;
        Round storage r = rounds[id];
        r.asset = asset;
        r.startPrice = startPrice;
        r.startTime = uint64(block.timestamp);
        r.lockTime = uint64(block.timestamp) + lockDuration;
        r.resolveTime = uint64(block.timestamp) + resolveDuration;
        emit RoundCreated(id, asset, startPrice, r.lockTime, r.resolveTime);
    }

    /// @notice AI-POWERED FUNCTION CALLABLE ON-CHAIN.
    ///         The autonomous AI agent writes its inference (prediction + reasoning) on-chain.
    function commitAiPrediction(uint256 id, Direction prediction, string calldata reasoning) external onlyAgent {
        Round storage r = rounds[id];
        require(r.startTime != 0, "no round");
        require(r.aiPrediction == Direction.None, "ai set");
        require(prediction != Direction.None, "bad pred");
        require(block.timestamp < r.lockTime, "locked");
        r.aiPrediction = prediction;
        r.aiReasoning = reasoning;
        emit AiCommitted(id, prediction, reasoning);
    }

    /// @notice Human commits a prediction for a round (one per address).
    function predict(uint256 id, Direction prediction) external {
        Round storage r = rounds[id];
        require(r.startTime != 0, "no round");
        require(block.timestamp < r.lockTime, "locked");
        require(prediction != Direction.None, "bad pred");
        require(userPrediction[id][msg.sender] == Direction.None, "already");
        userPrediction[id][msg.sender] = prediction;
        if (prediction == Direction.Up) r.humanUp++; else r.humanDown++;
        emit Predicted(id, msg.sender, prediction);
    }

    /// @notice Keeper resolves a round with the real end price.
    function resolve(uint256 id, int256 endPrice) external onlyOwner {
        Round storage r = rounds[id];
        require(r.startTime != 0, "no round");
        require(!r.resolved, "resolved");
        require(r.aiPrediction != Direction.None, "ai pending");
        r.endPrice = endPrice;
        Outcome o = endPrice >= r.startPrice ? Outcome.Up : Outcome.Down;
        r.outcome = o;
        r.resolved = true;
        bool aiCorrect = uint8(r.aiPrediction) == uint8(o);
        emit Resolved(id, endPrice, o, aiCorrect);
    }

    /// @notice User settles their own result: updates personal stats + global human score.
    function settle(uint256 id) external {
        Round storage r = rounds[id];
        require(r.resolved, "not resolved");
        Direction p = userPrediction[id][msg.sender];
        require(p != Direction.None, "no prediction");
        require(!settled[id][msg.sender], "settled");
        settled[id][msg.sender] = true;

        Stat storage s = stats[msg.sender];
        s.played++;
        bool userCorrect = uint8(p) == uint8(r.outcome);
        bool aiCorrect = uint8(r.aiPrediction) == uint8(r.outcome);
        if (userCorrect) s.correct++;
        // Clean head-to-head tally for the global "Humans vs Machines" scoreboard.
        if (userCorrect && aiCorrect) {
            ties++;
        } else if (userCorrect && !aiCorrect) {
            humanWins++;
            s.beatAi++;
        } else if (!userCorrect && aiCorrect) {
            aiWins++;
        }
        emit Settled(id, msg.sender, userCorrect, userCorrect && !aiCorrect);
    }

    // ---- views ----
    function getRound(uint256 id) external view returns (Round memory) { return rounds[id]; }
    function getStat(address u) external view returns (Stat memory) { return stats[u]; }
    function scoreboard() external view returns (uint256 _human, uint256 _ai, uint256 _ties) {
        return (humanWins, aiWins, ties);
    }
}
