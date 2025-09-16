// SPDX-License-Identifier: MIT
pragma solidity >=0.8.12 <0.9.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ILazyDelegateRegistry} from "./interfaces/ILazyDelegateRegistry.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract LazyVoter is Ownable {
    event EligibleSerialsRemoved(uint256[] serials);
    // --- OWNER: Batch remove eligible serials before voting starts ---
    function removeEligibleSerials(
        uint256[] calldata serials
    ) external onlyOwner {
        if (block.timestamp >= startTime) revert VoteStarted();
        for (uint256 i = 0; i < serials.length; i++) {
            eligibleSerialsSet.remove(serials[i]);
        }
        emit EligibleSerialsRemoved(serials);
    }

    // --- OWNER: Batch update eligible serials (add and remove in one tx) ---
    function updateEligibleSerials(
        uint256[] calldata addSerials,
        uint256[] calldata removeSerials
    ) external onlyOwner {
        if (block.timestamp >= startTime) revert VoteStarted();
        _addEligibleSerials(addSerials);
        for (uint256 i = 0; i < removeSerials.length; i++) {
            eligibleSerialsSet.remove(removeSerials[i]);
        }
        emit EligibleSerialsAdded(addSerials);
        emit EligibleSerialsRemoved(removeSerials);
    }
    // --- VIEW: Get all voters (addresses) who have voted ---
    function getAllVoters() external view returns (address[] memory voters) {
        uint256 len = votedSerialsSet.length();
        voters = new address[](len);
        for (uint256 i = 0; i < len; i++) {
            uint256 serial = votedSerialsSet.at(i);
            voters[i] = serialVotes[serial].voter;
        }
    }

    // --- VIEW: Get time remaining for voting ---
    function timeRemaining() external view returns (uint256) {
        if (block.timestamp >= endTime) return 0;
        if (block.timestamp < startTime) return endTime - startTime;
        return endTime - block.timestamp;
    }

    // --- VIEW: Get paginated eligible serials ---
    function getEligibleSerials(
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory serials) {
        uint256 total = eligibleSerialsSet.length();
        if (offset >= total) return new uint256[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 len = end - offset;
        serials = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            serials[i] = eligibleSerialsSet.at(offset + i);
        }
    }
    using Address for address payable;
    using EnumerableSet for EnumerableSet.UintSet;

    // --- SNAPSHOT VARIABLES ---
    EnumerableSet.UintSet private eligibleSerialsSet;
    error SerialNotEligible(uint256 serial);
    // --- PAUSABLE ---
    bool public votingPaused;
    event VotingPaused(bool paused);
    event EligibleSerialsAdded(uint256[] serials);

    // --- OWNER EMERGENCY CONTROLS ---
    function pauseVoting() external onlyOwner {
        votingPaused = true;
        emit VotingPaused(true);
    }
    function unpauseVoting() external onlyOwner {
        votingPaused = false;
        emit VotingPaused(false);
    }

    // --- STATE VARIABLES ---
    string public voteMessage;
    address public immutable NFT_TOKEN;
    uint256 public quorum;
    uint256 public startTime;
    uint256 public endTime;
    ILazyDelegateRegistry public lazyDelegateRegistry;

    // --- VOTING DATA STRUCTURES ---
    enum VoteType {
        No,
        Yes,
        Abstain,
        None
    }
    struct VoteInfo {
        VoteType voteType;
        address voter;
        uint256 timestamp;
    }
    // serial => VoteInfo
    mapping(uint256 => VoteInfo) internal serialVotes;
    // serials that have voted
    EnumerableSet.UintSet private votedSerialsSet;
    // vote counts
    uint256 public yesCount;
    uint256 public noCount;
    uint256 public abstainCount;

    // --- ERRORS ---
    error ZeroAddress();
    error InvalidTime();
    error RegistryRequired();
    error NFTTokenRequired();
    error VotingIsPaused();
    error VoteStarted();
    error InsufficientBalance();
    error NotOwnerOrDelegated(uint256 serial);
    error VoteWindowClosed();
    error MaxSerialsExceeded();

    // --- EVENTS ---
    event VoteMessageUpdated(string newMessage);
    event QuorumUpdated(uint256 newQuorum);
    event VoteCasted(address indexed voter, uint256[] serials, uint8 voteType);
    event HbarWithdrawn(address indexed receiver, uint256 amount);

    // --- CONSTRUCTOR ---
    constructor(
        string memory _voteMessage,
        address _nftToken,
        uint256 _quorum,
        uint256 _startTime,
        uint256 _endTime,
        address _lazyDelegateRegistry,
        uint256[] memory _eligibleSerials
    ) {
        if (_nftToken == address(0)) revert NFTTokenRequired();
        if (_lazyDelegateRegistry == address(0)) revert RegistryRequired();
        if (_endTime <= _startTime) revert InvalidTime();
        voteMessage = _voteMessage;
        NFT_TOKEN = _nftToken;
        quorum = _quorum;
        startTime = _startTime;
        endTime = _endTime;
        lazyDelegateRegistry = ILazyDelegateRegistry(_lazyDelegateRegistry);
        if (_eligibleSerials.length > 0) {
            _addEligibleSerials(_eligibleSerials);
        }
    }

    // --- OWNER: Batch add/update eligible serials before voting starts ---
    function addEligibleSerials(uint256[] calldata serials) external onlyOwner {
        if (block.timestamp >= startTime) revert VoteStarted();
        _addEligibleSerials(serials);
        emit EligibleSerialsAdded(serials);
    }

    function _addEligibleSerials(uint256[] memory serials) internal {
        for (uint256 i = 0; i < serials.length; i++) {
            eligibleSerialsSet.add(serials[i]);
        }
    }

    // --- OWNER FUNCTIONS ---
    function updateVoteMessage(string memory _newMessage) external onlyOwner {
        if (block.timestamp >= startTime) revert VoteStarted();
        voteMessage = _newMessage;
        emit VoteMessageUpdated(_newMessage);
    }

    function updateQuorum(uint256 _newQuorum) external onlyOwner {
        if (block.timestamp >= startTime) revert VoteStarted();

        quorum = _newQuorum;
        emit QuorumUpdated(_newQuorum);
    }

    function withdrawHbar(
        address payable receiver,
        uint256 amount
    ) external onlyOwner {
        if (receiver == address(0)) revert ZeroAddress();
        if (amount == 0 || address(this).balance < amount)
            revert InsufficientBalance();
        Address.sendValue(receiver, amount);
        emit HbarWithdrawn(receiver, amount);
    }

    // --- RECEIVE FUNCTION ---
    receive() external payable {}

    // --- VOTING LOGIC ---
    function vote(uint256[] calldata serials, VoteType voteType) external {
        if (votingPaused) revert VotingIsPaused();
        if (block.timestamp < startTime || block.timestamp > endTime)
            revert VoteWindowClosed();
        if (serials.length == 0 || serials.length > 40)
            revert MaxSerialsExceeded();
        for (uint256 i = 0; i < serials.length; i++) {
            uint256 serial = serials[i];
            if (!eligibleSerialsSet.contains(serial))
                revert SerialNotEligible(serial);
            address owner = IERC721(NFT_TOKEN).ownerOf(serial);
            bool delegated = lazyDelegateRegistry.checkDelegateToken(
                msg.sender,
                NFT_TOKEN,
                serial
            );
            if (owner != msg.sender && !delegated)
                revert NotOwnerOrDelegated(serial);

            VoteInfo storage v = serialVotes[serial];
            // If already voted, update counts
            if (v.voteType == VoteType.Yes) yesCount--;
            else if (v.voteType == VoteType.No) noCount--;
            else if (v.voteType == VoteType.Abstain) abstainCount--;

            // Set new vote
            v.voteType = voteType;
            v.voter = msg.sender;
            v.timestamp = block.timestamp;

            // Add to votedSerialsSet if first vote
            if (!votedSerialsSet.contains(serial)) {
                votedSerialsSet.add(serial);
            }

            // Update counts
            if (voteType == VoteType.Yes) yesCount++;
            else if (voteType == VoteType.No) noCount++;
            else if (voteType == VoteType.Abstain) abstainCount++;
        }
        emit VoteCasted(msg.sender, serials, uint8(voteType));
    }

    // --- VIEW: Total eligible voters (NFT supply) ---
    function totalEligibleVoters() public view returns (uint256) {
        return eligibleSerialsSet.length();
    }

    // --- VIEW: All votes for a given address ---
    function getVotesByAddress(
        address voter
    )
        external
        view
        returns (uint256[] memory serials, VoteType[] memory votes)
    {
        uint256 count;
        for (uint256 i = 0; i < votedSerialsSet.length(); i++) {
            uint256 serial = votedSerialsSet.at(i);
            if (serialVotes[serial].voter == voter) count++;
        }
        serials = new uint256[](count);
        votes = new VoteType[](count);
        uint256 idx;
        for (uint256 i = 0; i < votedSerialsSet.length(); i++) {
            uint256 serial = votedSerialsSet.at(i);
            if (serialVotes[serial].voter == voter) {
                serials[idx] = serial;
                votes[idx] = serialVotes[serial].voteType;
                idx++;
            }
        }
    }

    // --- VIEW: Voting timeline status ---
    function votingStatus() public view returns (string memory) {
        if (votingPaused) return "Paused";
        if (block.timestamp < startTime) return "NotStarted";
        if (block.timestamp > endTime) return "Ended";
        return "Active";
    }

    // --- VIEW: Quorum percentage ---
    function quorumPercent() public view returns (uint256) {
        // Returns quorum as basis points (bps, 1/100 of a percent)
        // quorum is the number of votes required
        // eligible is the total number of eligible voters
        uint256 eligible = totalEligibleVoters();
        if (eligible == 0) return 0;
        return (quorum * 10000) / eligible;
    }

    // --- VIEW: Last voter for a serial ---
    function lastVoterForSerial(
        uint256 serial
    ) public view returns (address, uint256) {
        VoteInfo memory v = serialVotes[serial];
        return (v.voter, v.timestamp);
    }

    // --- VIEW: All voters and their votes (paginated) ---
    function getAllVotes(
        uint256 offset,
        uint256 limit
    )
        external
        view
        returns (
            uint256[] memory serials,
            address[] memory voters,
            VoteType[] memory votes
        )
    {
        uint256 total = votedSerialsSet.length();
        if (offset >= total)
            return (new uint256[](0), new address[](0), new VoteType[](0));
        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 len = end - offset;
        serials = new uint256[](len);
        voters = new address[](len);
        votes = new VoteType[](len);
        for (uint256 i = 0; i < len; i++) {
            uint256 serial = votedSerialsSet.at(offset + i);
            serials[i] = serial;
            voters[i] = serialVotes[serial].voter;
            votes[i] = serialVotes[serial].voteType;
        }
    }

    // --- VIEW FUNCTIONS ---
    function hasQuorum() public view returns (bool) {
        return yesCount >= quorum;
    }

    function getVoteInfo(
        uint256 serial
    ) external view returns (VoteType, address, uint256) {
        VoteInfo memory v = serialVotes[serial];
        return (v.voteType, v.voter, v.timestamp);
    }

    function getVotedSerials() external view returns (uint256[] memory) {
        uint256 len = votedSerialsSet.length();
        uint256[] memory serials = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            serials[i] = votedSerialsSet.at(i);
        }
        return serials;
    }

    function getResults()
        external
        view
        returns (uint256 yes, uint256 no, uint256 abstain)
    {
        return (yesCount, noCount, abstainCount);
    }
}
