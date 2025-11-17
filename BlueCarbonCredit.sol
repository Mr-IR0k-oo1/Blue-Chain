// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title BlueCarbonCredit
 * @dev Enhanced ERC721 contract for Blue Carbon Credits with comprehensive features
 * Includes role-based access control, project lifecycle management, and MRV integration
 */
contract BlueCarbonCredit is ERC721, ERC721URIStorage, Ownable, AccessControl, Pausable, ReentrancyGuard {
    using Counters for Counters.Counter;
    
    Counters.Counter private _tokenIdCounter;
    Counters.Counter private _projectIdCounter;
    
    // Role definitions
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");
    bytes32 public constant REGISTRY_ADMIN_ROLE = keccak256("REGISTRY_ADMIN_ROLE");
    bytes32 public constant MRV_OPERATOR_ROLE = keccak256("MRV_OPERATOR_ROLE");
    
    // Project status enum
    enum ProjectStatus { 
        Registered,     // Initial registration
        UnderReview,    // MRV in progress
        Verified,       // Third-party verified
        Approved,       // Registry approved
        Active,         // Credits issued
        Completed,      // Project completed
        Rejected,       // Failed verification
        Retired         // Credits retired
    }
    
    // Ecosystem types
    enum EcosystemType {
        Mangrove,
        Seagrass,
        SaltMarsh,
        TidalWetland,
        Other
    }
    
    // Enhanced project structure
    struct Project {
        uint256 projectId;
        string name;
        string location;
        EcosystemType ecosystemType;
        uint256 area; // in hectares
        uint256 carbonAmount; // in tons CO2e
        uint256 creditPrice; // in wei
        string ipfsHash;
        string methodologyUsed;
        address projectOwner;
        address verifier;
        address approvedBy;
        ProjectStatus status;
        uint256 registrationDate;
        uint256 verificationDate;
        uint256 issuanceDate;
        uint256 validityPeriod; // in years
        bool isTransferable;
        bool isRetired;
        uint256[] mrvReports; // Array of MRV report IDs
    }
    
    // MRV (Monitoring, Reporting, Verification) Report structure
    struct MRVReport {
        uint256 reportId;
        uint256 projectId;
        string ipfsHash;
        uint256 reportingPeriodStart;
        uint256 reportingPeriodEnd;
        uint256 measuredCarbon;
        address reporter;
        address verifier;
        bool isVerified;
        uint256 timestamp;
        string notes;
    }
    
    // Carbon credit batch for fractional ownership
    struct CreditBatch {
        uint256 batchId;
        uint256 projectId;
        uint256 totalCredits;
        uint256 availableCredits;
        uint256 pricePerCredit;
        address issuer;
        uint256 issuanceDate;
        uint256 expiryDate;
        bool isActive;
    }
    
    // Mappings
    mapping(uint256 => Project) public projects;
    mapping(uint256 => MRVReport) public mrvReports;
    mapping(uint256 => CreditBatch) public creditBatches;
    mapping(uint256 => uint256) public tokenToProject; // tokenId => projectId
    mapping(uint256 => uint256) public tokenToBatch; // tokenId => batchId
    mapping(address => uint256[]) public ownerProjects;
    mapping(uint256 => address[]) public projectCollaborators;
    
    // Counters for MRV and batches
    Counters.Counter private _mrvReportIdCounter;
    Counters.Counter private _creditBatchIdCounter;
    
    
    // Enhanced Events
    event ProjectRegistered(
        uint256 indexed projectId,
        address indexed owner,
        string name,
        EcosystemType ecosystemType,
        uint256 area
    );
    
    event ProjectStatusUpdated(
        uint256 indexed projectId,
        ProjectStatus oldStatus,
        ProjectStatus newStatus,
        address updatedBy
    );
    
    event MRVReportSubmitted(
        uint256 indexed reportId,
        uint256 indexed projectId,
        address indexed reporter,
        uint256 measuredCarbon
    );
    
    event MRVReportVerified(
        uint256 indexed reportId,
        address indexed verifier,
        bool approved
    );
    
    event CreditBatchIssued(
        uint256 indexed batchId,
        uint256 indexed projectId,
        uint256 totalCredits,
        address indexed issuer
    );
    
    event CreditMinted(
        uint256 indexed tokenId,
        address indexed recipient,
        uint256 indexed batchId,
        uint256 credits
    );
    
    event CreditRetired(
        uint256 indexed tokenId,
        address indexed owner,
        uint256 credits,
        string reason
    );
    
    event CreditTransferred(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to,
        uint256 credits
    );
    
    constructor() ERC721("BlueCarbonCredit", "BCC") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(REGISTRY_ADMIN_ROLE, msg.sender);
        _grantRole(VERIFIER_ROLE, msg.sender);
    }
    
    // Modifiers
    modifier onlyVerifier() {
        require(hasRole(VERIFIER_ROLE, msg.sender), "Caller is not a verifier");
        _;
    }
    
    modifier onlyAuditor() {
        require(hasRole(AUDITOR_ROLE, msg.sender), "Caller is not an auditor");
        _;
    }
    
    modifier onlyRegistryAdmin() {
        require(hasRole(REGISTRY_ADMIN_ROLE, msg.sender), "Caller is not a registry admin");
        _;
    }
    
    modifier onlyMRVOperator() {
        require(hasRole(MRV_OPERATOR_ROLE, msg.sender), "Caller is not an MRV operator");
        _;
    }
    
    /**
     * @dev Register a new blue carbon project
     */
    function registerProject(
        string memory name,
        string memory location,
        EcosystemType ecosystemType,
        uint256 area,
        string memory methodologyUsed,
        string memory ipfsHash
    ) public returns (uint256) {
        require(bytes(name).length > 0, "Project name cannot be empty");
        require(bytes(location).length > 0, "Location cannot be empty");
        require(area > 0, "Area must be greater than 0");
        
        uint256 projectId = _projectIdCounter.current();
        _projectIdCounter.increment();
        
        Project storage newProject = projects[projectId];
        newProject.projectId = projectId;
        newProject.name = name;
        newProject.location = location;
        newProject.ecosystemType = ecosystemType;
        newProject.area = area;
        newProject.methodologyUsed = methodologyUsed;
        newProject.ipfsHash = ipfsHash;
        newProject.projectOwner = msg.sender;
        newProject.status = ProjectStatus.Registered;
        newProject.registrationDate = block.timestamp;
        newProject.isTransferable = true;
        
        ownerProjects[msg.sender].push(projectId);
        
        emit ProjectRegistered(projectId, msg.sender, name, ecosystemType, area);
        
        return projectId;
    }
    
    /**
     * @dev Submit MRV report for a project
     */
    function submitMRVReport(
        uint256 projectId,
        string memory ipfsHash,
        uint256 reportingPeriodStart,
        uint256 reportingPeriodEnd,
        uint256 measuredCarbon,
        string memory notes
    ) public onlyMRVOperator returns (uint256) {
        require(projects[projectId].projectOwner != address(0), "Project does not exist");
        require(reportingPeriodEnd > reportingPeriodStart, "Invalid reporting period");
        
        uint256 reportId = _mrvReportIdCounter.current();
        _mrvReportIdCounter.increment();
        
        MRVReport storage report = mrvReports[reportId];
        report.reportId = reportId;
        report.projectId = projectId;
        report.ipfsHash = ipfsHash;
        report.reportingPeriodStart = reportingPeriodStart;
        report.reportingPeriodEnd = reportingPeriodEnd;
        report.measuredCarbon = measuredCarbon;
        report.reporter = msg.sender;
        report.timestamp = block.timestamp;
        report.notes = notes;
        
        projects[projectId].mrvReports.push(reportId);
        
        // Update project status if first report
        if (projects[projectId].status == ProjectStatus.Registered) {
            projects[projectId].status = ProjectStatus.UnderReview;
            emit ProjectStatusUpdated(projectId, ProjectStatus.Registered, ProjectStatus.UnderReview, msg.sender);
        }
        
        emit MRVReportSubmitted(reportId, projectId, msg.sender, measuredCarbon);
        
        return reportId;
    }
    
    /**
     * @dev Verify MRV report
     */
    function verifyMRVReport(
        uint256 reportId,
        bool approved
    ) public onlyVerifier {
        require(mrvReports[reportId].reporter != address(0), "Report does not exist");
        require(!mrvReports[reportId].isVerified, "Report already verified");
        
        mrvReports[reportId].verifier = msg.sender;
        mrvReports[reportId].isVerified = true;
        
        uint256 projectId = mrvReports[reportId].projectId;
        
        if (approved) {
            projects[projectId].carbonAmount += mrvReports[reportId].measuredCarbon;
            
            if (projects[projectId].status == ProjectStatus.UnderReview) {
                projects[projectId].status = ProjectStatus.Verified;
                projects[projectId].verifier = msg.sender;
                projects[projectId].verificationDate = block.timestamp;
                emit ProjectStatusUpdated(projectId, ProjectStatus.UnderReview, ProjectStatus.Verified, msg.sender);
            }
        }
        
        emit MRVReportVerified(reportId, msg.sender, approved);
    }
    
    /**
     * @dev Approve project for credit issuance
     */
    function approveProject(uint256 projectId) public onlyRegistryAdmin {
        require(projects[projectId].status == ProjectStatus.Verified, "Project must be verified first");
        
        projects[projectId].status = ProjectStatus.Approved;
        projects[projectId].approvedBy = msg.sender;
        
        emit ProjectStatusUpdated(projectId, ProjectStatus.Verified, ProjectStatus.Approved, msg.sender);
    }
    
    /**
     * @dev Issue credit batch for approved project
     */
    function issueCreditBatch(
        uint256 projectId,
        uint256 totalCredits,
        uint256 pricePerCredit,
        uint256 validityYears
    ) public onlyRegistryAdmin returns (uint256) {
        require(projects[projectId].status == ProjectStatus.Approved, "Project must be approved");
        require(totalCredits > 0, "Total credits must be greater than 0");
        
        uint256 batchId = _creditBatchIdCounter.current();
        _creditBatchIdCounter.increment();
        
        CreditBatch storage batch = creditBatches[batchId];
        batch.batchId = batchId;
        batch.projectId = projectId;
        batch.totalCredits = totalCredits;
        batch.availableCredits = totalCredits;
        batch.pricePerCredit = pricePerCredit;
        batch.issuer = msg.sender;
        batch.issuanceDate = block.timestamp;
        batch.expiryDate = block.timestamp + (validityYears * 365 days);
        batch.isActive = true;
        
        projects[projectId].status = ProjectStatus.Active;
        projects[projectId].issuanceDate = block.timestamp;
        projects[projectId].validityPeriod = validityYears;
        
        emit CreditBatchIssued(batchId, projectId, totalCredits, msg.sender);
        emit ProjectStatusUpdated(projectId, ProjectStatus.Approved, ProjectStatus.Active, msg.sender);
        
        return batchId;
    }
    
    
    /**
     * @dev Mint carbon credits from a batch
     */
    function mintCredit(
        address to,
        uint256 batchId,
        uint256 credits
    ) public onlyRegistryAdmin nonReentrant returns (uint256) {
        require(creditBatches[batchId].isActive, "Batch is not active");
        require(creditBatches[batchId].availableCredits >= credits, "Insufficient credits available");
        require(block.timestamp <= creditBatches[batchId].expiryDate, "Credits have expired");
        
        uint256 tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        
        // Update batch availability
        creditBatches[batchId].availableCredits -= credits;
        
        // Link token to project and batch
        tokenToProject[tokenId] = creditBatches[batchId].projectId;
        tokenToBatch[tokenId] = batchId;
        
        // Mint the NFT
        _safeMint(to, tokenId);
        
        // Set token URI to project IPFS hash
        uint256 projectId = creditBatches[batchId].projectId;
        string memory tokenURI = string(abi.encodePacked("ipfs://", projects[projectId].ipfsHash));
        _setTokenURI(tokenId, tokenURI);
        
        emit CreditMinted(tokenId, to, batchId, credits);
        
        return tokenId;
    }
    
    /**
     * @dev Retire carbon credits (permanently remove from circulation)
     */
    function retireCredit(uint256 tokenId, string memory reason) public {
        require(_isApprovedOrOwner(msg.sender, tokenId), "Caller is not owner nor approved");
        require(!projects[tokenToProject[tokenId]].isRetired, "Credits already retired");
        
        projects[tokenToProject[tokenId]].isRetired = true;
        
        emit CreditRetired(tokenId, msg.sender, 1, reason);
        
        // Burn the token
        _burn(tokenId);
    }
    
    /**
     * @dev Pause contract (emergency function)
     */
    function pause() public onlyOwner {
        _pause();
    }
    
    /**
     * @dev Unpause contract
     */
    function unpause() public onlyOwner {
        _unpause();
    }
    
    /**
     * @dev Add verifier role
     */
    function addVerifier(address account) public onlyRegistryAdmin {
        _grantRole(VERIFIER_ROLE, account);
    }
    
    /**
     * @dev Add auditor role
     */
    function addAuditor(address account) public onlyRegistryAdmin {
        _grantRole(AUDITOR_ROLE, account);
    }
    
    /**
     * @dev Add MRV operator role
     */
    function addMRVOperator(address account) public onlyRegistryAdmin {
        _grantRole(MRV_OPERATOR_ROLE, account);
    }
    
    /**
     * @dev Get project details by project ID
     */
    function getProject(uint256 projectId) public view returns (Project memory) {
        require(projects[projectId].projectOwner != address(0), "Project does not exist");
        return projects[projectId];
    }
    
    /**
     * @dev Get MRV report details
     */
    function getMRVReport(uint256 reportId) public view returns (MRVReport memory) {
        require(mrvReports[reportId].reporter != address(0), "Report does not exist");
        return mrvReports[reportId];
    }
    
    /**
     * @dev Get credit batch details
     */
    function getCreditBatch(uint256 batchId) public view returns (CreditBatch memory) {
        require(creditBatches[batchId].issuer != address(0), "Batch does not exist");
        return creditBatches[batchId];
    }
    
    /**
     * @dev Get projects owned by address
     */
    function getProjectsByOwner(address owner) public view returns (uint256[] memory) {
        return ownerProjects[owner];
    }
    
    /**
     * @dev Get MRV reports for a project
     */
    function getProjectMRVReports(uint256 projectId) public view returns (uint256[] memory) {
        require(projects[projectId].projectOwner != address(0), "Project does not exist");
        return projects[projectId].mrvReports;
    }
    
    /**
     * @dev Get total number of registered projects
     */
    function getTotalProjects() public view returns (uint256) {
        return _projectIdCounter.current();
    }
    
    /**
     * @dev Get total number of minted credits
     */
    function getTotalCredits() public view returns (uint256) {
        return _tokenIdCounter.current();
    }
    
    /**
     * @dev Get total carbon sequestered across all projects
     */
    function getTotalCarbonSequestered() public view returns (uint256) {
        uint256 total = 0;
        uint256 currentProjects = _projectIdCounter.current();
        
        for (uint256 i = 0; i < currentProjects; i++) {
            if (projects[i].projectOwner != address(0)) {
                total += projects[i].carbonAmount;
            }
        }
        
        return total;
    }
    
    /**
     * @dev Get registry statistics
     */
    function getRegistryStats() public view returns (
        uint256 totalProjects,
        uint256 totalCredits,
        uint256 totalCarbon,
        uint256 totalMRVReports,
        uint256 totalBatches
    ) {
        return (
            _projectIdCounter.current(),
            _tokenIdCounter.current(),
            getTotalCarbonSequestered(),
            _mrvReportIdCounter.current(),
            _creditBatchIdCounter.current()
        );
    }
    
    // Override functions for access control and pausability
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
        
        // Check if credit is transferable
        uint256 projectId = tokenToProject[tokenId];
        require(projects[projectId].isTransferable, "Credits are not transferable");
        
        // Emit transfer event for tracking
        if (from != address(0) && to != address(0)) {
            emit CreditTransferred(tokenId, from, to, 1);
        }
    }
    
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721, ERC721URIStorage, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
    
    // Override required functions
    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
    }
    
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }
}