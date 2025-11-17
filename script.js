// API Configuration
const API_BASE = 'http://localhost:3001/api';

// API Error Classes
class APIError extends Error {
    constructor(message, status, code, data = null) {
        super(message);
        this.name = 'APIError';
        this.status = status;
        this.code = code;
        this.data = data;
    }
}

class NetworkError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NetworkError';
    }
}

class AuthenticationError extends APIError {
    constructor(message) {
        super(message, 401, 'AUTHENTICATION_ERROR');
        this.name = 'AuthenticationError';
    }
}

class ValidationError extends APIError {
    constructor(message, data) {
        super(message, 400, 'VALIDATION_ERROR', data);
        this.name = 'ValidationError';
    }
}

class ServerError extends APIError {
    constructor(message, status) {
        super(message, status, 'SERVER_ERROR');
        this.name = 'ServerError';
    }
}

// Retry configuration
const RETRY_CONFIG = {
    maxRetries: 3,
    retryDelay: 1000, // Base delay in ms
    backoffMultiplier: 2,
    retryableStatuses: [408, 429, 500, 502, 503, 504] // Request Timeout, Too Many Requests, Server Errors
};

// Utility functions for API calls
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    };

    // Add auth token if available
    const token = localStorage.getItem('authToken');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }

    let lastError;
    let attempt = 0;

    while (attempt <= RETRY_CONFIG.maxRetries) {
        try {
            const response = await fetch(url, config);

            // Handle different response types
            let data;
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = await response.text();
            }

            if (!response.ok) {
                // Categorize errors based on status code
                const error = categorizeAPIError(response.status, data);
                throw error;
            }

            return data;
        } catch (error) {
            lastError = error;

            // Don't retry on certain errors
            if (!shouldRetry(error, attempt)) {
                break;
            }

            // Calculate delay with exponential backoff
            const delay = RETRY_CONFIG.retryDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
            console.warn(`API request failed (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1}), retrying in ${delay}ms:`, error.message);

            await new Promise(resolve => setTimeout(resolve, delay));
            attempt++;
        }
    }

    // Log final error
    console.error('API request failed after all retries:', lastError);
    throw lastError;
}

// Error categorization helper
function categorizeAPIError(status, data) {
    const message = data?.message || data?.error || `HTTP ${status} error`;

    switch (status) {
        case 400:
            return new ValidationError(message, data);
        case 401:
            return new AuthenticationError(message);
        case 403:
            return new APIError(message, status, 'FORBIDDEN', data);
        case 404:
            return new APIError(message, status, 'NOT_FOUND', data);
        case 409:
            return new APIError(message, status, 'CONFLICT', data);
        case 422:
            return new ValidationError(message, data);
        case 429:
            return new APIError(message, status, 'RATE_LIMITED', data);
        case 500:
        case 502:
        case 503:
        case 504:
            return new ServerError(message, status);
        default:
            return new APIError(message, status, 'UNKNOWN_ERROR', data);
    }
}

// Determine if request should be retried
function shouldRetry(error, attempt) {
    // Don't retry on authentication or validation errors
    if (error instanceof AuthenticationError || error instanceof ValidationError) {
        return false;
    }

    // Retry on network errors
    if (error instanceof NetworkError) {
        return true;
    }

    // Retry on specific HTTP status codes
    if (error instanceof APIError && RETRY_CONFIG.retryableStatuses.includes(error.status)) {
        return true;
    }

    return false;
}

// Enhanced error handling utilities
function handleAPIError(error, context = '') {
    const errorContext = context ? `[${context}] ` : '';

    // Log error for debugging
    console.error(`${errorContext}API Error:`, {
        name: error.name,
        message: error.message,
        status: error.status,
        code: error.code,
        data: error.data
    });

    // Handle specific error types
    if (error instanceof AuthenticationError) {
        handleAuthenticationError(error);
    } else if (error instanceof ValidationError) {
        handleValidationError(error);
    } else if (error instanceof NetworkError) {
        handleNetworkError(error);
    } else if (error instanceof ServerError) {
        handleServerError(error);
    } else {
        handleGenericError(error);
    }
}

function handleAuthenticationError(error) {
    // Clear invalid token
    removeAuthToken();

    // Show login required message
    showNotification('Your session has expired. Please log in again.', 'warning');

    // Redirect to login after a short delay
    setTimeout(() => {
        window.location.href = 'login.html';
    }, 2000);
}

function handleValidationError(error) {
    const messages = Array.isArray(error.data?.errors)
        ? error.data.errors.map(err => err.message || err).join(', ')
        : error.message;

    showNotification(`Validation Error: ${messages}`, 'error');
}

function handleNetworkError(error) {
    showNotification('Network connection error. Please check your internet connection and try again.', 'error');
}

function handleServerError(error) {
    showNotification('Server is temporarily unavailable. Please try again later.', 'error');
}

function handleGenericError(error) {
    showNotification(error.message || 'An unexpected error occurred. Please try again.', 'error');
}

// User-friendly error messages
function getUserFriendlyErrorMessage(error) {
    if (error instanceof NetworkError) {
        return 'Unable to connect. Please check your internet connection.';
    }

    if (error instanceof AuthenticationError) {
        return 'Your session has expired. Please log in again.';
    }

    if (error instanceof ValidationError) {
        return 'Please check your input and try again.';
    }

    if (error instanceof ServerError) {
        return 'Service temporarily unavailable. Please try again later.';
    }

    // Specific error codes
    switch (error.code) {
        case 'NOT_FOUND':
            return 'The requested resource was not found.';
        case 'FORBIDDEN':
            return 'You don\'t have permission to perform this action.';
        case 'CONFLICT':
            return 'This action conflicts with existing data.';
        case 'RATE_LIMITED':
            return 'Too many requests. Please wait a moment and try again.';
        default:
            return error.message || 'An unexpected error occurred.';
    }
}

// Retry utility for user-initiated retries
async function retryAPIRequest(requestFn, maxRetries = 2, context = '') {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await requestFn();
        } catch (error) {
            lastError = error;

            if (attempt < maxRetries && shouldRetry(error, attempt)) {
                const delay = RETRY_CONFIG.retryDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            break;
        }
    }

    handleAPIError(lastError, context);
    throw lastError;
}

// Loading state management
function showLoadingState(element, message = 'Loading...') {
    if (typeof element === 'string') {
        element = document.querySelector(element);
    }

    if (!element) return;

    element.classList.add('loading');
    element.disabled = true;

    // Add loading text if it's a button
    if (element.tagName === 'BUTTON') {
        element.dataset.originalText = element.innerHTML;
        element.innerHTML = `<span class="loading-spinner"></span> ${message}`;
    }
}

function hideLoadingState(element) {
    if (typeof element === 'string') {
        element = document.querySelector(element);
    }

    if (!element) return;

    element.classList.remove('loading');
    element.disabled = false;

    // Restore original text if it's a button
    if (element.tagName === 'BUTTON' && element.dataset.originalText) {
        element.innerHTML = element.dataset.originalText;
        delete element.dataset.originalText;
    }
}

// Enhanced notification system with retry options
function showErrorNotification(message, error, retryCallback = null, context = '') {
    const userMessage = getUserFriendlyErrorMessage(error);

    // Create enhanced notification with retry option
    const notification = document.createElement('div');
    notification.className = `toast toast-error animate-fade-in error-notification`;
    notification.innerHTML = `
        <div class="toast-icon">
            <i class="fas fa-exclamation-circle"></i>
        </div>
        <div class="toast-content">
            <div class="toast-title">Error</div>
            <div class="toast-message">${userMessage}</div>
            ${retryCallback ? '<div class="toast-actions mt-2"><button class="btn btn-sm btn-outline-light retry-btn">Try Again</button></div>' : ''}
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
    `;

    document.body.appendChild(notification);

    // Add retry functionality
    if (retryCallback) {
        const retryBtn = notification.querySelector('.retry-btn');
        retryBtn.addEventListener('click', async () => {
            notification.remove();
            try {
                await retryCallback();
            } catch (retryError) {
                showErrorNotification('Retry failed', retryError, null, context);
            }
        });
    }

    // Auto remove after timeout
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, retryCallback ? 10000 : 5000); // Longer timeout if retry option available
}

// Authentication utilities
function setAuthToken(token) {
    localStorage.setItem('authToken', token);
}

function getAuthToken() {
    return localStorage.getItem('authToken');
}

function removeAuthToken() {
    localStorage.removeItem('authToken');
}

function isAuthenticated() {
    return !!getAuthToken();
}

// Counter Animation
function animateCounter(element, target, duration = 2000) {
    let start = 0;
    const increment = target / (duration / 16);
    const timer = setInterval(() => {
        start += increment;
        if (start >= target) {
            element.textContent = target.toLocaleString();
            clearInterval(timer);
        } else {
            element.textContent = Math.floor(start).toLocaleString();
        }
    }, 16);
}

// Initialize counters when page loads
document.addEventListener('DOMContentLoaded', function() {
    const projectCounter = document.getElementById('projectCounter');
    const creditCounter = document.getElementById('creditCounter');
    const communityCounter = document.getElementById('communityCounter');
    const revenueCounter = document.getElementById('revenueCounter');

    // Start animations with delay
    setTimeout(() => animateCounter(projectCounter, 127), 500);
    setTimeout(() => animateCounter(creditCounter, 45620), 700);
    setTimeout(() => animateCounter(communityCounter, 89), 900);
    setTimeout(() => animateCounter(revenueCounter, 23000000), 1100); // 2.3Cr = 23,000,000
});

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Add fade-in animation to sections on scroll
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('fade-in-up');
        }
    });
}, observerOptions);

// Observe all sections
document.querySelectorAll('section').forEach(section => {
    observer.observe(section);
});

// Navbar background change on scroll
window.addEventListener('scroll', function() {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 50) {
        navbar.style.backgroundColor = 'rgba(30, 30, 30, 0.95)';
        navbar.style.backdropFilter = 'blur(10px)';
    } else {
        navbar.style.backgroundColor = 'var(--bg-secondary)';
        navbar.style.backdropFilter = 'none';
    }
});

// Mobile menu close on link click
document.querySelectorAll('.navbar-nav .nav-link').forEach(link => {
    link.addEventListener('click', () => {
        const navbarCollapse = document.querySelector('.navbar-collapse');
        if (navbarCollapse.classList.contains('show')) {
            const bsCollapse = new bootstrap.Collapse(navbarCollapse, {
                hide: true
            });
        }
    });
});

// Add loading animation
window.addEventListener('load', function() {
    document.body.classList.add('loaded');
});

// Add some interactive effects
document.querySelectorAll('.feature-card, .participant-card').forEach(card => {
    card.addEventListener('mouseenter', function() {
        this.style.transform = 'translateY(-10px) scale(1.02)';
    });

    card.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0) scale(1)';
    });
});

// Login Page Functionality
let currentUserType = 'farmer';
let isAadhaarModalOpen = false;

// Initialize login functionality when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeLoginPage();
});

function initializeLoginPage() {
    // Set up user type selection
    setupUserTypeSelection();

    // Set up password toggles
    setupPasswordToggles();

    // Set up form submissions
    setupFormSubmissions();

    // Set up Aadhaar modal
    setupAadhaarModal();

    // Set up social login
    setupSocialLogin();

    // Set up verification method toggle
    setupVerificationMethodToggle();

    // Show default form (farmer)
    selectUserType('farmer');
}

// User Type Selection
function setupUserTypeSelection() {
    const userTypeCards = document.querySelectorAll('.user-type-card');
    userTypeCards.forEach(card => {
        card.addEventListener('click', function() {
            const userType = this.id.replace('-card', '');
            selectUserType(userType);
        });
    });
}

function selectUserType(userType) {
    currentUserType = userType;

    // Update active card
    document.querySelectorAll('.user-type-card').forEach(card => {
        card.classList.remove('active');
    });
    document.getElementById(`${userType}-card`).classList.add('active');

    // Hide all forms
    document.querySelectorAll('.login-form').forEach(form => {
        form.classList.remove('active');
    });

    // Show selected form
    document.getElementById(`${userType}-login`).classList.add('active');
}

// Password Toggle Functionality
function setupPasswordToggles() {
    const passwordToggles = document.querySelectorAll('.password-toggle');
    passwordToggles.forEach(toggle => {
        toggle.addEventListener('click', function() {
            const inputId = this.getAttribute('onclick').match(/'([^']+)'/)[1];
            togglePassword(inputId);
        });
    });
}

function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const toggle = input.nextElementSibling;

    if (input.type === 'password') {
        input.type = 'text';
        toggle.innerHTML = '<i class="fas fa-eye-slash"></i>';
    } else {
        input.type = 'password';
        toggle.innerHTML = '<i class="fas fa-eye"></i>';
    }
}

// Form Validation and Submission
function setupFormSubmissions() {
    const forms = {
        'farmer': 'farmerLoginForm',
        'corporate': 'corporateLoginForm',
        'ngo': 'ngoLoginForm',
        'admin': 'adminLoginForm',
        'verifier': 'verifierLoginForm'
    };

    Object.keys(forms).forEach(userType => {
        const form = document.getElementById(forms[userType]);
        if (form) {
            form.addEventListener('submit', function(e) {
                e.preventDefault();
                handleLogin(userType, form);
            });
        }
    });
}

async function handleLogin(userType, form) {
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    // Basic validation
    if (!validateLoginForm(userType, data)) {
        return;
    }

    // Show loading state
    const submitBtn = form.querySelector('button[type="submit"]');
    showLoadingState(submitBtn, 'Logging in...');

    try {
        const success = await authenticateUser(userType, data);

        if (success) {
            showNotification('Login successful! Redirecting...', 'success');
            setTimeout(() => {
                redirectToDashboard(userType);
            }, 1500);
        } else {
            hideLoadingState(submitBtn);
            showNotification('Invalid credentials. Please try again.', 'error');
        }
    } catch (error) {
        hideLoadingState(submitBtn);
        // Error handling is now done in authenticateUser via handleAPIError
        // No need to show additional error message here
    }
}

function validateLoginForm(userType, data) {
    let isValid = true;
    const errors = [];

    // Common validations
    if (!data.email && !data.username && !data.id) {
        errors.push('Please enter your login credentials.');
        isValid = false;
    }

    if (!data.password) {
        errors.push('Password is required.');
        isValid = false;
    }

    // User type specific validations
    switch(userType) {
        case 'farmer':
            if (!data.kisanCard && !data.mobile) {
                errors.push('Kisan Card Number or Mobile Number is required.');
                isValid = false;
            }
            break;
        case 'corporate':
            if (!data.email) {
                errors.push('Company email is required.');
                isValid = false;
            }
            break;
        case 'ngo':
            if (!data.email) {
                errors.push('Organization email is required.');
                isValid = false;
            }
            break;
        case 'admin':
            if (!data.id) {
                errors.push('Admin ID is required.');
                isValid = false;
            }
            if (!data.securityKey) {
                errors.push('Security Key is required.');
                isValid = false;
            }
            break;
        case 'verifier':
            if (!data.id) {
                errors.push('Verifier ID is required.');
                isValid = false;
            }
            break;
    }

    if (!isValid) {
        showNotification(errors.join(' '), 'error');
    }

    return isValid;
}

async function authenticateUser(userType, data) {
    try {
        // Map user types to API roles
        const roleMapping = {
            farmer: 'project_owner',
            corporate: 'project_owner',
            ngo: 'project_owner',
            admin: 'admin',
            verifier: 'verifier'
        };

        const loginData = {
            email: data.email || data.username || data.id,
            password: data.password,
            role: roleMapping[userType] || 'project_owner'
        };

        // Add additional fields based on user type
        if (userType === 'farmer') {
            loginData.kisanCard = data.kisanCard;
            loginData.mobile = data.mobile;
        } else if (userType === 'admin') {
            loginData.securityKey = data.securityKey;
        }

        const response = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify(loginData)
        });

        if (response.success) {
            setAuthToken(response.data.token);
            return true;
        }
        return false;
    } catch (error) {
        handleAPIError(error, 'Authentication');
        return false;
    }
}

function redirectToDashboard(userType) {
    const dashboardUrls = {
        farmer: 'farmer-dashboard.html',
        corporate: 'company-dashboard.html',
        ngo: 'ngo-dashboard.html',
        admin: 'admin-dashboard.html',
        verifier: 'verification-portal.html'
    };

    window.location.href = dashboardUrls[userType] || 'index.html';
}

// Aadhaar Modal Functionality
function setupAadhaarModal() {
    const modal = new bootstrap.Modal(document.getElementById('aadhaarModal'));

    window.openAadhaarLogin = function() {
        modal.show();
        isAadhaarModalOpen = true;
    };

    window.sendAadhaarOTP = function() {
        const aadhaarNumber = document.querySelector('#aadhaarLoginForm input[type="text"]').value;

        if (!aadhaarNumber || aadhaarNumber.length !== 12) {
            showNotification('Please enter a valid 12-digit Aadhaar number.', 'error');
            return;
        }

        showNotification('OTP sent to your registered mobile number.', 'success');

        // Simulate OTP input field
        const otpSection = document.getElementById('otpSection');
        otpSection.innerHTML = `
            <div class="mb-3">
                <label class="form-label">Enter OTP</label>
                <input type="text" class="form-control" placeholder="Enter 6-digit OTP" maxlength="6" required>
            </div>
            <p class="small text-secondary">OTP expires in 5 minutes</p>
        `;
    };

    window.verifyAadhaar = function() {
        const aadhaarNumber = document.querySelector('#aadhaarLoginForm input[type="text"]').value;
        const otp = document.querySelector('#otpSection input')?.value;
        const method = document.getElementById('verificationMethod').value;

        if (method === 'otp' && (!otp || otp.length !== 6)) {
            showNotification('Please enter a valid 6-digit OTP.', 'error');
            return;
        }

        if (method === 'biometric') {
            showNotification('Biometric verification initiated. Please scan your fingerprint.', 'info');
            setTimeout(() => {
                showNotification('Biometric verification successful!', 'success');
                modal.hide();
                setTimeout(() => redirectToDashboard('farmer'), 1000);
            }, 3000);
            return;
        }

        // Mock OTP verification
        if (otp === '123456') {
            showNotification('Aadhaar verification successful! Logging you in...', 'success');
            modal.hide();
            setTimeout(() => redirectToDashboard('farmer'), 1500);
        } else {
            showNotification('Invalid OTP. Please try again.', 'error');
        }
    };
}

function setupVerificationMethodToggle() {
    const methodSelect = document.getElementById('verificationMethod');
    const otpSection = document.getElementById('otpSection');
    const biometricSection = document.getElementById('biometricSection');

    methodSelect.addEventListener('change', function() {
        if (this.value === 'otp') {
            otpSection.style.display = 'block';
            biometricSection.style.display = 'none';
        } else {
            otpSection.style.display = 'none';
            biometricSection.style.display = 'block';
        }
    });
}

// Social Login Placeholders
function setupSocialLogin() {
    const socialButtons = document.querySelectorAll('.btn-social');
    socialButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            const loginType = this.textContent.trim();
            showNotification(`${loginType} login is coming soon!`, 'info');
        });
    });
}

// Loading States (keeping for backward compatibility, but enhanced version above is preferred)
function showLoadingState(form) {
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="loading-spinner"></span> Logging in...';
    submitBtn.classList.add('btn-loading');
}

function hideLoadingState(form) {
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = false;
    submitBtn.innerHTML = submitBtn.innerHTML.replace('<span class="loading-spinner"></span> Logging in...',
        submitBtn.innerHTML.includes('Farmer') ? '<i class="fas fa-sign-in-alt me-2"></i>Login to Farmer Account' :
        submitBtn.innerHTML.includes('Corporate') ? '<i class="fas fa-sign-in-alt me-2"></i>Login to Corporate Account' :
        submitBtn.innerHTML.includes('NGO') ? '<i class="fas fa-sign-in-alt me-2"></i>Login to NGO Account' :
        submitBtn.innerHTML.includes('Admin') ? '<i class="fas fa-sign-in-alt me-2"></i>Login to Admin Portal' :
        '<i class="fas fa-sign-in-alt me-2"></i>Login to Verification Portal');
    submitBtn.classList.remove('btn-loading');
}

// Notification System
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.toast');
    existingNotifications.forEach(notification => notification.remove());

    const notification = document.createElement('div');
    notification.className = `toast toast-${type} animate-fade-in`;
    notification.innerHTML = `
        <div class="toast-icon">
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
        </div>
        <div class="toast-content">
            <div class="toast-title">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
    `;

    document.body.appendChild(notification);

    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// Add some interactive effects for login page
document.addEventListener('DOMContentLoaded', function() {
    // Add hover effects to form inputs
    const formInputs = document.querySelectorAll('.form-control');
    formInputs.forEach(input => {
        input.addEventListener('focus', function() {
            this.parentElement.classList.add('focused');
        });
        input.addEventListener('blur', function() {
            this.parentElement.classList.remove('focused');
        });
    });

    // Add click effects to buttons
    const buttons = document.querySelectorAll('.btn');
    buttons.forEach(button => {
        button.addEventListener('mousedown', function() {
            this.style.transform = 'scale(0.98)';
        });
        button.addEventListener('mouseup', function() {
            this.style.transform = '';
        });
    });

    // Initialize theme toggle functionality
    initializeThemeToggle();
});

// Dashboard Data Loading Functions
async function loadDashboardData() {
    try {
        // Load all dashboard data in parallel
        const [userProfile, dashboardStats, projects, notifications] = await Promise.allSettled([
            loadUserProfile(),
            loadDashboardStats(),
            loadUserProjects(),
            loadNotifications()
        ]);

        // Update UI with loaded data
        if (userProfile.status === 'fulfilled') {
            updateUserProfile(userProfile.value);
        }

        if (dashboardStats.status === 'fulfilled') {
            updateDashboardStats(dashboardStats.value);
        }

        if (projects.status === 'fulfilled') {
            updateProjectsList(projects.value);
        }

        if (notifications.status === 'fulfilled') {
            updateNotifications(notifications.value);
        }

        // Handle any failed requests
        [userProfile, dashboardStats, projects, notifications].forEach((result, index) => {
            if (result.status === 'rejected') {
                const endpoints = ['User Profile', 'Dashboard Stats', 'Projects', 'Notifications'];
                console.warn(`Failed to load ${endpoints[index]}:`, result.reason);
                handleAPIError(result.reason, `Dashboard ${endpoints[index]}`);
            }
        });

    } catch (error) {
        console.error('Error loading dashboard data:', error);
        handleAPIError(error, 'Dashboard Loading');
    }
}

async function loadUserProfile() {
    return await apiRequest('/auth/profile');
}

async function loadDashboardStats() {
    return await apiRequest('/dashboard/stats');
}

async function loadUserProjects() {
    return await apiRequest('/projects');
}

async function loadNotifications() {
    return await apiRequest('/notifications');
}

// Update UI Functions
function updateUserProfile(profile) {
    // Update sidebar user info
    const userNameElement = document.querySelector('.sidebar .fw-bold');
    const userIdElement = document.querySelector('.sidebar .text-secondary');

    if (userNameElement && profile.name) {
        userNameElement.textContent = profile.name;
    }

    if (userIdElement && profile.kisanCard) {
        userIdElement.textContent = `Kisan: ${profile.kisanCard}`;
    }

    // Update welcome message
    const welcomeElement = document.querySelector('.main-content h3');
    if (welcomeElement && profile.name) {
        welcomeElement.textContent = `Welcome back, ${profile.name}! 👋`;
    }
}

function updateDashboardStats(stats) {
    // Update stat cards
    const statCards = [
        { id: 'totalArea', value: stats.totalArea, suffix: ' Ha', change: stats.areaChange },
        { id: 'creditsGenerated', value: stats.creditsGenerated, suffix: '', change: stats.creditsChange },
        { id: 'revenueEarned', value: formatCurrency(stats.revenueEarned), suffix: '', change: formatCurrency(stats.revenueChange) },
        { id: 'activeProjects', value: stats.activeProjects, suffix: '', change: stats.projectsChange }
    ];

    statCards.forEach(stat => {
        const card = document.querySelector(`[data-stat="${stat.id}"]`);
        if (card) {
            const valueElement = card.querySelector('h4');
            const changeElement = card.querySelector('small');

            if (valueElement) {
                valueElement.textContent = stat.value + stat.suffix;
            }

            if (changeElement && stat.change) {
                changeElement.textContent = stat.change;
            }
        }
    });
}

function updateProjectsList(projects) {
    // Hide loading spinner and show table
    const loadingElement = document.getElementById('projects-loading');
    const tableElement = document.getElementById('projects-table');

    if (loadingElement) loadingElement.style.display = 'none';
    if (tableElement) tableElement.style.display = 'block';

    const tbody = document.querySelector('#projects-table .table tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (projects.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-4">
                    <i class="fas fa-inbox fa-2x text-secondary mb-2"></i>
                    <p class="text-secondary mb-0">No projects found. Start your first carbon project!</p>
                </td>
            </tr>
        `;
    } else {
        projects.forEach(project => {
            const row = createProjectRow(project);
            tbody.appendChild(row);
        });
    }

    // Update project count in sidebar
    const projectBadge = document.querySelector('.nav-link[href="#projects"] .badge');
    if (projectBadge) {
        projectBadge.textContent = projects.length;
    }
}

function createProjectRow(project) {
    const row = document.createElement('tr');

    const statusBadge = getStatusBadge(project.status);
    const progressPercent = Math.round(project.progress * 100);

    row.innerHTML = `
        <td>
            <strong>${project.name}</strong>
            <br><small class="text-secondary">${project.location}</small>
        </td>
        <td>${project.area} Ha</td>
        <td>${statusBadge}</td>
        <td>${project.credits || '-'} tCO2e</td>
        <td>
            <div class="progress" style="height: 6px;">
                <div class="progress-bar ${getProgressBarClass(project.status)}" style="width: ${progressPercent}%"></div>
            </div>
            <small>${progressPercent}% complete</small>
        </td>
        <td>
            <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-primary" onclick="viewProject('${project.id}')">View</button>
                ${project.status === 'planning' ? '<button class="btn btn-outline-success" onclick="uploadProjectData(\'' + project.id + '\')">Upload</button>' : ''}
                ${project.status === 'under_verification' ? '<button class="btn btn-outline-info" onclick="checkVerificationStatus(\'' + project.id + '\')">Status</button>' : ''}
            </div>
        </td>
    `;

    return row;
}

function getStatusBadge(status) {
    const statusMap = {
        'verified': '<span class="badge bg-success">Verified</span>',
        'under_verification': '<span class="badge bg-warning">Under Verification</span>',
        'planning': '<span class="badge bg-secondary">Planning</span>',
        'completed': '<span class="badge bg-info">Completed</span>',
        'rejected': '<span class="badge bg-danger">Rejected</span>'
    };

    return statusMap[status] || '<span class="badge bg-secondary">Unknown</span>';
}

function getProgressBarClass(status) {
    const classMap = {
        'verified': 'bg-success',
        'under_verification': 'bg-warning',
        'planning': 'bg-secondary',
        'completed': 'bg-info',
        'rejected': 'bg-danger'
    };

    return classMap[status] || 'bg-secondary';
}

function updateNotifications(notifications) {
    const notificationDropdown = document.querySelector('.dropdown-menu');
    if (!notificationDropdown) return;

    // Clear existing notifications except header
    const header = notificationDropdown.querySelector('.dropdown-header');
    notificationDropdown.innerHTML = '';
    notificationDropdown.appendChild(header);

    // Add new notifications
    notifications.slice(0, 5).forEach(notification => {
        const item = document.createElement('a');
        item.className = 'dropdown-item';
        item.href = '#';
        item.innerHTML = `
            <div class="${notification.type === 'success' ? 'text-success' : notification.type === 'warning' ? 'text-warning' : ''}">
                ${notification.icon} ${notification.message}
            </div>
            <small class="text-secondary">${formatTimeAgo(notification.timestamp)}</small>
        `;
        notificationDropdown.appendChild(item);
    });

    // Update notification badge count
    const badge = document.querySelector('.notification-badge');
    if (badge) {
        badge.textContent = notifications.length;
        badge.style.display = notifications.length > 0 ? 'inline' : 'none';
    }
}

// Utility Functions
function formatCurrency(amount) {
    if (amount >= 100000) {
        return `₹${(amount / 100000).toFixed(2)}L`;
    } else if (amount >= 1000) {
        return `₹${(amount / 1000).toFixed(1)}K`;
    }
    return `₹${amount}`;
}

function formatTimeAgo(timestamp) {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInHours = Math.floor((now - time) / (1000 * 60 * 60));

    if (diffInHours < 1) {
        return 'Just now';
    } else if (diffInHours < 24) {
        return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    } else {
        const diffInDays = Math.floor(diffInHours / 24);
        return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
    }
}

// Project Actions
async function viewProject(projectId) {
    try {
        showLoadingState(null, 'Loading project details...');
        const project = await apiRequest(`/projects/${projectId}`);
        // TODO: Open project detail modal or navigate to project page
        console.log('Project details:', project);
        showNotification('Project details loaded', 'success');
    } catch (error) {
        handleAPIError(error, 'View Project');
    } finally {
        hideLoadingState(null);
    }
}

async function uploadProjectData(projectId) {
    // TODO: Implement file upload for project data
    showNotification('Upload functionality coming soon', 'info');
}

async function checkVerificationStatus(projectId) {
    try {
        const status = await apiRequest(`/projects/${projectId}/verification`);
        // TODO: Show verification status modal
        console.log('Verification status:', status);
    } catch (error) {
        handleAPIError(error, 'Verification Status');
    }
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Check authentication first
    if (!isAuthenticated()) {
        window.location.href = 'login.html';
        return;
    }

    // Load dashboard data
    loadDashboardData();

    // Initialize other dashboard functionality
    initializeThemeToggle();
});

// Company Dashboard Data Loading Functions
async function loadCompanyDashboardData() {
    try {
        // Load all company dashboard data in parallel
        const [companyProfile, companyStats, marketplaceProjects, transactions] = await Promise.allSettled([
            loadCompanyProfile(),
            loadCompanyStats(),
            loadMarketplaceProjects(),
            loadCompanyTransactions()
        ]);

        // Update UI with loaded data
        if (companyProfile.status === 'fulfilled') {
            updateCompanyProfile(companyProfile.value);
        }

        if (companyStats.status === 'fulfilled') {
            updateCompanyStats(companyStats.value);
        }

        if (marketplaceProjects.status === 'fulfilled') {
            updateMarketplaceProjects(marketplaceProjects.value);
        }

        if (transactions.status === 'fulfilled') {
            updateCompanyTransactions(transactions.value);
        }

        // Handle any failed requests
        [companyProfile, companyStats, marketplaceProjects, transactions].forEach((result, index) => {
            if (result.status === 'rejected') {
                const endpoints = ['Company Profile', 'Company Stats', 'Marketplace Projects', 'Transactions'];
                console.warn(`Failed to load ${endpoints[index]}:`, result.reason);
                handleAPIError(result.reason, `Company Dashboard ${endpoints[index]}`);
            }
        });

    } catch (error) {
        console.error('Error loading company dashboard data:', error);
        handleAPIError(error, 'Company Dashboard Loading');
    }
}

async function loadCompanyProfile() {
    return await apiRequest('/auth/profile');
}

async function loadCompanyStats() {
    return await apiRequest('/company/dashboard/stats');
}

async function loadMarketplaceProjects() {
    return await apiRequest('/marketplace/projects');
}

async function loadCompanyTransactions() {
    return await apiRequest('/company/transactions');
}

// Update Company UI Functions
function updateCompanyProfile(profile) {
    // Update header company info
    const companyNameElement = document.querySelector('.navbar .fw-bold');
    const companyIdElement = document.querySelector('.navbar .text-secondary');

    if (companyNameElement && profile.companyName) {
        companyNameElement.textContent = profile.companyName;
    }

    if (companyIdElement && profile.cin) {
        companyIdElement.textContent = profile.cin;
    }

    // Update dashboard header
    const dashboardTitle = document.querySelector('.dashboard-header h1');
    const dashboardSubtitle = document.querySelector('.dashboard-header p');

    if (dashboardTitle && profile.companyName) {
        dashboardTitle.textContent = `${profile.companyName} Carbon Portfolio`;
    }

    if (dashboardSubtitle && profile.cin) {
        dashboardSubtitle.innerHTML = `CIN: ${profile.cin} | Last updated: ${new Date().toLocaleDateString()}`;
    }

    // Update ESG rating
    const esgBadge = document.querySelector('.dashboard-header .badge');
    if (esgBadge && profile.esgRating) {
        esgBadge.textContent = `${profile.esgRating} Rated`;
    }
}

function updateCompanyStats(stats) {
    // Update stat cards
    const statCards = [
        { id: 'totalCredits', value: stats.totalCredits, suffix: '', change: stats.creditsChange },
        { id: 'creditsRetired', value: stats.creditsRetired, suffix: '', change: stats.retiredChange },
        { id: 'availableBalance', value: stats.availableBalance, suffix: '', change: formatCurrency(stats.balanceChange) },
        { id: 'esgRating', value: stats.esgRating, suffix: '', change: stats.esgChange }
    ];

    statCards.forEach(stat => {
        const card = document.querySelector(`[data-stat="${stat.id}"]`);
        if (card) {
            if (stat.id === 'esgRating') {
                // Special handling for ESG rating card
                const esgScoreElement = card.querySelector('.esg-score');
                const progressBar = card.querySelector('.progress-bar');
                const changeElement = card.querySelector('small');

                if (esgScoreElement) esgScoreElement.textContent = stat.value;
                if (progressBar) progressBar.style.width = `${stats.esgScore || 0}%`;
                if (changeElement && stat.change) changeElement.textContent = stat.change;
            } else {
                const valueElement = card.querySelector('h3');
                const changeElement = card.querySelector('small');

                if (valueElement) {
                    valueElement.textContent = stat.id === 'availableBalance' ? formatCurrency(stat.value) : stat.value;
                }
                if (changeElement && stat.change) {
                    changeElement.textContent = stat.change;
                }
            }
        }
    });
}

function updateMarketplaceProjects(projects) {
    // Hide loading spinner and show projects
    const loadingElement = document.getElementById('marketplace-loading');
    const projectsContainer = document.getElementById('marketplace-projects');

    if (loadingElement) loadingElement.style.display = 'none';
    if (projectsContainer) projectsContainer.style.display = 'block';

    projectsContainer.innerHTML = '';

    if (projects.length === 0) {
        projectsContainer.innerHTML = `
            <div class="col-12">
                <div class="text-center py-4">
                    <i class="fas fa-inbox fa-2x text-secondary mb-2"></i>
                    <p class="text-secondary mb-0">No projects available in marketplace</p>
                </div>
            </div>
        `;
    } else {
        projects.forEach(project => {
            const projectCard = createMarketplaceProjectCard(project);
            projectsContainer.appendChild(projectCard);
        });
    }
}

function createMarketplaceProjectCard(project) {
    const colDiv = document.createElement('div');
    colDiv.className = 'col-md-6 mb-4';

    const statusClass = project.status === 'verified' ? 'border-success' : 'border-warning';
    const statusBadge = project.status === 'verified' ? '<span class="badge bg-success">Verified</span>' : '<span class="badge bg-warning">Under Verification</span>';

    colDiv.innerHTML = `
        <div class="card project-card ${statusClass} h-100">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <h5 class="card-title">${project.name}</h5>
                    ${statusBadge}
                </div>
                <p class="card-text text-secondary">
                    <i class="fas fa-map-marker-alt me-1"></i>${project.location}
                </p>
                <div class="mb-2">
                    ${project.impacts.map(impact => `<span class="impact-badge badge bg-primary">${impact}</span>`).join(' ')}
                </div>
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <div>
                        <strong class="${project.status === 'verified' ? 'text-success' : 'text-warning'}">${project.availableCredits} tCO2e</strong><br>
                        <small>${project.status === 'verified' ? 'Available' : 'Estimated'}</small>
                    </div>
                    <div class="text-end">
                        <strong>₹${project.pricePerCredit}/credit</strong><br>
                        <small>Total: ${formatCurrency(project.availableCredits * project.pricePerCredit)}</small>
                    </div>
                </div>
                <div class="d-grid gap-2">
                    <button class="btn btn-outline-${project.status === 'verified' ? 'success' : 'warning'} btn-sm" onclick="viewProjectDetails('${project.id}')">
                        <i class="fas fa-eye me-1"></i>View Details
                    </button>
                    <button class="btn btn-${project.status === 'verified' ? 'success' : 'warning'} btn-sm" onclick="${project.status === 'verified' ? 'makeOffer' : 'expressInterest'}('${project.id}')">
                        <i class="fas fa-${project.status === 'verified' ? 'shopping-cart' : 'star'} me-1"></i>${project.status === 'verified' ? 'Make Offer' : 'Express Interest'}
                    </button>
                </div>
            </div>
        </div>
    `;

    return colDiv;
}

function updateCompanyTransactions(transactions) {
    // Hide loading spinner and show table
    const loadingElement = document.getElementById('transactions-loading');
    const tableElement = document.getElementById('transactions-table');

    if (loadingElement) loadingElement.style.display = 'none';
    if (tableElement) tableElement.style.display = 'block';

    const tbody = tableElement.querySelector('tbody');
    tbody.innerHTML = '';

    if (transactions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-4">
                    <i class="fas fa-inbox fa-2x text-secondary mb-2"></i>
                    <p class="text-secondary mb-0">No transactions found</p>
                </td>
            </tr>
        `;
    } else {
        transactions.forEach(transaction => {
            const row = createTransactionRow(transaction);
            tbody.appendChild(row);
        });
    }
}

function createTransactionRow(transaction) {
    const row = document.createElement('tr');

    const typeBadge = transaction.type === 'purchase' ? '<span class="badge bg-primary">Purchase</span>' : '<span class="badge bg-success">Retirement</span>';
    const statusBadge = getTransactionStatusBadge(transaction.status);

    row.innerHTML = `
        <td>${new Date(transaction.date).toLocaleDateString()}</td>
        <td>${transaction.projectName}</td>
        <td>${typeBadge}</td>
        <td>${transaction.credits} tCO2e</td>
        <td>${formatCurrency(transaction.amount)}</td>
        <td>${statusBadge}</td>
        <td>
            ${transaction.status === 'completed' ? `
                <button class="btn btn-sm btn-outline-primary" onclick="downloadCertificate('${transaction.id}')">Certificate</button>
                <button class="btn btn-sm btn-outline-info" onclick="downloadInvoice('${transaction.id}')">Invoice</button>
            ` : `
                <button class="btn btn-sm btn-outline-secondary" onclick="trackTransaction('${transaction.id}')">Track</button>
            `}
        </td>
    `;

    return row;
}

function getTransactionStatusBadge(status) {
    const statusMap = {
        'completed': '<span class="badge bg-success">Completed</span>',
        'processing': '<span class="badge bg-warning">Processing</span>',
        'pending': '<span class="badge bg-secondary">Pending</span>',
        'failed': '<span class="badge bg-danger">Failed</span>'
    };

    return statusMap[status] || '<span class="badge bg-secondary">Unknown</span>';
}

// Company Dashboard Actions
async function makeOffer(projectId) {
    const offer = prompt('Enter your offer price per credit (₹):');
    if (offer && !isNaN(offer)) {
        try {
            showLoadingState(null, 'Submitting offer...');
            await apiRequest('/marketplace/offer', {
                method: 'POST',
                body: JSON.stringify({ projectId, offerPrice: parseFloat(offer) })
            });
            showNotification('Offer submitted successfully!', 'success');
        } catch (error) {
            handleAPIError(error, 'Make Offer');
        } finally {
            hideLoadingState(null);
        }
    }
}

async function expressInterest(projectId) {
    try {
        showLoadingState(null, 'Expressing interest...');
        await apiRequest('/marketplace/interest', {
            method: 'POST',
            body: JSON.stringify({ projectId })
        });
        showNotification('Interest expressed successfully! You will be notified when the project is verified.', 'success');
    } catch (error) {
        handleAPIError(error, 'Express Interest');
    } finally {
        hideLoadingState(null);
    }
}

async function downloadCertificate(transactionId) {
    try {
        const response = await apiRequest(`/transactions/${transactionId}/certificate`);
        // Handle file download
        const blob = new Blob([response], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `certificate-${transactionId}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
    } catch (error) {
        handleAPIError(error, 'Download Certificate');
    }
}

async function downloadInvoice(transactionId) {
    try {
        const response = await apiRequest(`/transactions/${transactionId}/invoice`);
        // Handle file download
        const blob = new Blob([response], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `invoice-${transactionId}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
    } catch (error) {
        handleAPIError(error, 'Download Invoice');
    }
}

async function trackTransaction(transactionId) {
    try {
        const status = await apiRequest(`/transactions/${transactionId}/status`);
        showNotification(`Transaction Status: ${status.status}`, 'info');
    } catch (error) {
        handleAPIError(error, 'Track Transaction');
    }
}

// Initialize company dashboard when page loads
document.addEventListener('DOMContentLoaded', function() {
    if (window.location.pathname.includes('company-dashboard.html')) {
        // Check authentication first
        if (!isAuthenticated()) {
            window.location.href = 'login.html';
            return;
        }

        // Load company dashboard data
        loadCompanyDashboardData();

        // Initialize other dashboard functionality
        initializeThemeToggle();
    }
});

// Theme Toggle Functionality
function initializeThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle) return;

    // Apply saved theme on page load
    applySavedTheme();

    // Add click event listener
    themeToggle.addEventListener('click', toggleTheme);
}

function toggleTheme() {
    const body = document.body;
    const currentTheme = body.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';

    // Apply the new theme
    applyTheme(newTheme);

    // Save to localStorage
    localStorage.setItem('theme', newTheme);

    // Update icon
    updateThemeIcon(newTheme);
}

function applyTheme(theme) {
    const body = document.body;
    if (theme === 'light') {
        body.setAttribute('data-theme', 'light');
    } else {
        body.removeAttribute('data-theme');
    }
}

function applySavedTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    applyTheme(savedTheme);
    updateThemeIcon(savedTheme);
}

function updateThemeIcon(theme) {
    const themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle) return;

    const icon = themeToggle.querySelector('i');
    if (!icon) return;

    if (theme === 'light') {
        icon.className = 'fas fa-sun';
        themeToggle.setAttribute('aria-label', 'Switch to dark theme');
    } else {
        icon.className = 'fas fa-moon';
        themeToggle.setAttribute('aria-label', 'Switch to light theme');
    }
}

// Farmer Registration Handler
async function handleFarmerRegistration(form) {
    const submitBtn = form.querySelector('button[type="submit"]');
    showLoadingState(submitBtn, 'Submitting registration...');

    try {
        // Collect form data
        const formData = new FormData(form);
        const registrationData = {
            // Personal Details
            fullName: formData.get('fullName'),
            fatherName: formData.get('fatherName'),
            dob: formData.get('dob'),
            gender: formData.get('gender'),
            mobile: formData.get('mobile'),
            email: formData.get('email'),
            address: formData.get('address'),
            state: formData.get('state'),
            district: formData.get('district'),
            pincode: formData.get('pincode'),
            kisanCard: formData.get('kisanCard'),

            // Aadhaar Details
            aadhaarNumber: formData.get('aadhaarNumber'),
            verificationMethod: formData.get('verificationMethod'),

            // Land Details
            landOwnership: formData.get('landOwnership'),
            totalArea: parseFloat(formData.get('totalArea')),
            surveyNumber: formData.get('surveyNumber'),
            landAddress: formData.get('landAddress'),
            projectType: formData.get('projectType'),
            projectStartDate: formData.get('projectStartDate'),
            experience: formData.get('experience'),

            // Bank Details
            bankName: formData.get('bankName'),
            branchName: formData.get('branchName'),
            accountNumber: formData.get('accountNumber'),
            ifscCode: formData.get('ifscCode'),
            accountType: formData.get('accountType'),

            // Declarations
            agreeTerms: formData.get('agreeTerms') === 'on',
            declareInfo: formData.get('declareInfo') === 'on',
            consentData: formData.get('consentData') === 'on'
        };

        // Validate collected data
        const validationErrors = validateFarmerRegistrationData(registrationData);
        if (validationErrors.length > 0) {
            throw new ValidationError('Please correct the following errors:', validationErrors);
        }

        // Submit registration
        const response = await apiRequest('/auth/register/farmer', {
            method: 'POST',
            body: JSON.stringify(registrationData)
        });

        if (response.success) {
            showNotification('Registration submitted successfully! You will receive verification status within 48 hours.', 'success');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        } else {
            throw new Error(response.message || 'Registration failed');
        }

    } catch (error) {
        handleAPIError(error, 'Farmer Registration');
    } finally {
        hideLoadingState(submitBtn);
    }
}

function validateFarmerRegistrationData(data) {
    const errors = [];

    // Personal Details Validation
    if (!data.fullName || data.fullName.length < 2) {
        errors.push('Full name must be at least 2 characters long');
    }

    if (!data.fatherName || data.fatherName.length < 2) {
        errors.push('Father/Husband name must be at least 2 characters long');
    }

    if (!data.dob) {
        errors.push('Date of birth is required');
    } else {
        const age = new Date().getFullYear() - new Date(data.dob).getFullYear();
        if (age < 18) {
            errors.push('You must be at least 18 years old');
        }
    }

    if (!data.mobile || !/^[0-9]{10}$/.test(data.mobile)) {
        errors.push('Please enter a valid 10-digit mobile number');
    }

    if (!data.address || data.address.length < 10) {
        errors.push('Please provide a complete address');
    }

    if (!data.kisanCard || !/^[0-9]{12}$/.test(data.kisanCard)) {
        errors.push('Please enter a valid 12-digit Kisan Card number');
    }

    // Aadhaar Validation
    if (!data.aadhaarNumber || !/^[0-9]{12}$/.test(data.aadhaarNumber)) {
        errors.push('Please enter a valid 12-digit Aadhaar number');
    }

    // Land Details Validation
    if (!data.totalArea || data.totalArea <= 0 || data.totalArea > 1000) {
        errors.push('Total land area must be between 0.1 and 1000 hectares');
    }

    if (!data.projectStartDate) {
        errors.push('Project start date is required');
    } else {
        const startDate = new Date(data.projectStartDate);
        const today = new Date();
        if (startDate < today) {
            errors.push('Project start date cannot be in the past');
        }
    }

    // Bank Details Validation
    if (!data.accountNumber || data.accountNumber.length < 8) {
        errors.push('Please enter a valid account number');
    }

    if (!data.ifscCode || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(data.ifscCode)) {
        errors.push('Please enter a valid IFSC code');
    }

    // Confirmations
    if (!data.agreeTerms) {
        errors.push('You must agree to the Terms & Conditions');
    }

    if (!data.declareInfo) {
        errors.push('You must declare that the information provided is true');
    }

    if (!data.consentData) {
        errors.push('You must consent to data sharing for verification');
    }

    return errors;
}


