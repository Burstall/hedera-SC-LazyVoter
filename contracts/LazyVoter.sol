// SPDX-License-Identifier: MIT
pragma solidity >=0.8.12 <0.9.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ILazyDelegateRegistry} from "./interfaces/ILazyDelegateRegistry.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract LazyVoter is Ownable {
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
    error SerialNotEligible(uint256 serial);

    // --- EVENTS ---
    event EligibleSerialsAdded(uint256[] serials);
    event EligibleSerialsRemoved(uint256[] serials);
    event VotingPaused(bool paused);
    event VoteMessageUpdated(string newMessage);
    event QuorumUpdated(uint256 newQuorum);
    event VoteCasted(address indexed voter, uint256[] serials, uint8 voteType);
    event HbarWithdrawn(address indexed receiver, uint256 amount);

    // --- STATE VARIABLES ---
    using Address for address payable;
    using EnumerableSet for EnumerableSet.UintSet;

    string public voteMessage;
    address public immutable NFT_TOKEN;
    uint256 public quorum;
    uint256 public startTime;
    uint256 public endTime;
    ILazyDelegateRegistry public lazyDelegateRegistry;
    bool public votingPaused;

    // Voting data structures
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
        bool hasVoted;
    }

    // Storage
    mapping(uint256 => VoteInfo) internal serialVotes;
    EnumerableSet.UintSet private eligibleSerialsSet;
    EnumerableSet.UintSet private votedSerialsSet;
    uint256 public yesCount;
    uint256 public noCount;
    uint256 public abstainCount;

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

    // --- OWNER-ONLY FUNCTIONS ---
    function addEligibleSerials(uint256[] calldata serials) external onlyOwner {
        if (block.timestamp >= startTime) revert VoteStarted();
        _addEligibleSerials(serials);
        emit EligibleSerialsAdded(serials);
    }

    function removeEligibleSerials(
        uint256[] calldata serials
    ) external onlyOwner {
        if (block.timestamp >= startTime) revert VoteStarted();
        for (uint256 i = 0; i < serials.length; i++) {
            eligibleSerialsSet.remove(serials[i]);
        }
        emit EligibleSerialsRemoved(serials);
    }

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

    function pauseVoting() external onlyOwner {
        votingPaused = true;
        emit VotingPaused(true);
    }

    function unpauseVoting() external onlyOwner {
        votingPaused = false;
        emit VotingPaused(false);
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
            address delegate = lazyDelegateRegistry.getNFTDelegatedTo(
                NFT_TOKEN,
                serial
            );

            if (delegate != address(0)) {
                // If delegated, only the delegate can vote
                if (msg.sender != delegate) revert NotOwnerOrDelegated(serial);
            } else {
                // If not delegated, only the owner can vote
                if (msg.sender != owner) revert NotOwnerOrDelegated(serial);
            }

            VoteInfo storage v = serialVotes[serial];
            // If already voted, update counts
            if (v.hasVoted) {
                if (v.voteType == VoteType.Yes) yesCount--;
                else if (v.voteType == VoteType.No) noCount--;
                else if (v.voteType == VoteType.Abstain) abstainCount--;
            }

            // Set new vote
            v.voteType = voteType;
            v.voter = msg.sender;
            v.timestamp = block.timestamp;
            v.hasVoted = true;

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

    // --- INTERNAL HELPERS ---
    function _addEligibleSerials(uint256[] memory serials) internal {
        for (uint256 i = 0; i < serials.length; i++) {
            eligibleSerialsSet.add(serials[i]);
        }
    }

    // --- VIEW FUNCTIONS ---
    function getAllVoters()
        external
        view
        returns (address[] memory voters, uint256[] memory voteCounts)
    {
        // Count unique voters and their vote counts
        uint256 totalVoted = votedSerialsSet.length();
        address[] memory tempVoters = new address[](totalVoted);
        uint256[] memory tempCounts = new uint256[](totalVoted);

        // First pass: collect all voters (may have duplicates)
        for (uint256 i = 0; i < totalVoted; i++) {
            uint256 serial = votedSerialsSet.at(i);
            tempVoters[i] = serialVotes[serial].voter;
        }

        // Second pass: count unique voters
        uint256 uniqueCount = 0;
        for (uint256 i = 0; i < totalVoted; i++) {
            address voter = tempVoters[i];
            bool found = false;
            for (uint256 j = 0; j < uniqueCount; j++) {
                if (tempVoters[j] == voter) {
                    tempCounts[j]++;
                    found = true;
                    break;
                }
            }
            if (!found) {
                tempVoters[uniqueCount] = voter;
                tempCounts[uniqueCount] = 1;
                uniqueCount++;
            }
        }

        // Create final arrays with correct size
        voters = new address[](uniqueCount);
        voteCounts = new uint256[](uniqueCount);
        for (uint256 i = 0; i < uniqueCount; i++) {
            voters[i] = tempVoters[i];
            voteCounts[i] = tempCounts[i];
        }
    }

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

    function timeRemaining() external view returns (uint256) {
        if (block.timestamp >= endTime) return 0;
        if (block.timestamp < startTime) return endTime - startTime;
        return endTime - block.timestamp;
    }

    function totalEligibleVoters() public view returns (uint256) {
        return eligibleSerialsSet.length();
    }

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

    function votingStatus() public view returns (string memory) {
        if (votingPaused) return "Paused";
        if (block.timestamp < startTime) return "NotStarted";
        if (block.timestamp > endTime) return "Ended";
        return "Active";
    }

    function quorumPercent() public view returns (uint256) {
        uint256 eligible = totalEligibleVoters();
        if (eligible == 0) return 0;
        return (quorum * 10000) / eligible;
    }

    function lastVoterForSerial(
        uint256 serial
    ) public view returns (address, uint256) {
        VoteInfo memory v = serialVotes[serial];
        if (!v.hasVoted) {
            return (address(0), 0);
        }
        return (v.voter, v.timestamp);
    }

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

    // --- RECEIVE FUNCTION ---
    receive() external payable {}
}
