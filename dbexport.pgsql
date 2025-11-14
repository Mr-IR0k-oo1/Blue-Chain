-- Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(20),
    user_type ENUM('farmer', 'company', 'ngo', 'verifier', 'admin'),
    status ENUM('pending', 'active', 'suspended'),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Farmers Table
CREATE TABLE farmers (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    kisan_card_number VARCHAR(12) UNIQUE,
    aadhaar_number VARCHAR(12),
    full_name VARCHAR(255),
    father_name VARCHAR(255),
    date_of_birth DATE,
    address JSONB,
    bank_details JSONB,
    verification_status ENUM('pending', 'verified', 'rejected')
);

-- Companies Table
CREATE TABLE companies (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    company_name VARCHAR(255),
    trade_name VARCHAR(255),
    cin_number VARCHAR(21) UNIQUE,
    gst_number VARCHAR(15) UNIQUE,
    pan_number VARCHAR(10),
    industry_sector VARCHAR(100),
    employee_count_range VARCHAR(50),
    esg_rating VARCHAR(10),
    registration_details JSONB
);

-- Projects Table
CREATE TABLE projects (
    id UUID PRIMARY KEY,
    farmer_id UUID REFERENCES farmers(id),
    ngo_id UUID REFERENCES ngos(id),
    title VARCHAR(255),
    description TEXT,
    project_type ENUM('mangrove', 'afforestation', 'seagrass', 'wetland'),
    area_hectares DECIMAL(10,2),
    location JSONB,
    coordinates GEOGRAPHY(POINT),
    status ENUM('planning', 'active', 'completed', 'suspended'),
    start_date DATE,
    estimated_completion DATE
);

-- Carbon Credits Table
CREATE TABLE carbon_credits (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    credit_amount DECIMAL(12,2),
    vintage_year INTEGER,
    status ENUM('generated', 'listed', 'sold', 'retired', 'cancelled'),
    token_id VARCHAR(100), -- Blockchain token ID
    verification_id UUID REFERENCES verifications(id),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Marketplace Listings
CREATE TABLE marketplace_listings (
    id UUID PRIMARY KEY,
    credit_id UUID REFERENCES carbon_credits(id),
    seller_id UUID REFERENCES users(id),
    price_per_credit DECIMAL(10,2),
    total_credits INTEGER,
    status ENUM('active', 'sold', 'cancelled'),
    listing_type ENUM('fixed', 'auction'),
    expiry_date TIMESTAMP
);

-- Transactions Table
CREATE TABLE transactions (
    id UUID PRIMARY KEY,
    listing_id UUID REFERENCES marketplace_listings(id),
    buyer_id UUID REFERENCES users(id),
    credit_amount DECIMAL(12,2),
    total_amount DECIMAL(15,2),
    transaction_fee DECIMAL(15,2),
    status ENUM('pending', 'completed', 'failed', 'refunded'),
    payment_gateway_id VARCHAR(255),
    blockchain_tx_hash VARCHAR(255),
    created_at TIMESTAMP
);

-- Verifications Table
CREATE TABLE verifications (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    verifier_id UUID REFERENCES users(id),
    verification_type ENUM('initial', 'periodic', 'special'),
    status ENUM('pending', 'in_progress', 'approved', 'rejected'),
    report_data JSONB,
    submitted_at TIMESTAMP,
    completed_at TIMESTAMP
);

-- Documents Table
CREATE TABLE documents (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    document_type VARCHAR(100),
    file_name VARCHAR(255),
    file_path VARCHAR(500),
    file_size INTEGER,
    mime_type VARCHAR(100),
    verification_status ENUM('pending', 'verified', 'rejected'),
    uploaded_at TIMESTAMP
);