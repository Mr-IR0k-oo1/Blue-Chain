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

function handleLogin(userType, form) {
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    // Basic validation
    if (!validateLoginForm(userType, data)) {
        return;
    }

    // Show loading state
    showLoadingState(form);

    // Simulate API call
    setTimeout(() => {
        // Mock authentication
        const success = mockAuthentication(userType, data);

        if (success) {
            showNotification('Login successful! Redirecting...', 'success');
            setTimeout(() => {
                redirectToDashboard(userType);
            }, 1500);
        } else {
            hideLoadingState(form);
            showNotification('Invalid credentials. Please try again.', 'error');
        }
    }, 2000);
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

function mockAuthentication(userType, data) {
    // Mock authentication - in real app, this would be an API call
    const mockCredentials = {
        farmer: { kisanCard: '1234567890', password: 'farmer123' },
        corporate: { email: 'admin@company.com', password: 'corporate123' },
        ngo: { email: 'contact@ngo.org', password: 'ngo123' },
        admin: { id: 'admin001', password: 'admin123', securityKey: 'SEC123' },
        verifier: { id: 'verifier001', password: 'verifier123' }
    };

    const creds = mockCredentials[userType];
    if (!creds) return false;

    // Check credentials based on user type
    switch(userType) {
        case 'farmer':
            return (data.kisanCard === creds.kisanCard || data.mobile === creds.kisanCard) && data.password === creds.password;
        case 'corporate':
        case 'ngo':
            return data.email === creds.email && data.password === creds.password;
        case 'admin':
            return data.id === creds.id && data.password === creds.password && data.securityKey === creds.securityKey;
        case 'verifier':
            return data.id === creds.id && data.password === creds.password;
        default:
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

// Loading States
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


