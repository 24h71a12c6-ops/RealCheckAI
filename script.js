// ========== NAVBAR SCROLL EFFECT ==========
window.addEventListener('scroll', () => {
    const navbar = document.getElementById('navbar');
    if (window.scrollY > 10) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

// ========== SCROLL REVEAL ANIMATION ==========
const observerOptions = {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px"
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

document.querySelectorAll('.reveal').forEach(el => {
    observer.observe(el);
});

// ========== HERO AI ANALYZER ==========
const analyzeBtn = document.getElementById('analyzeBtn');
if (analyzeBtn) {
    analyzeBtn.addEventListener('click', function() {
        const input = document.getElementById('analyzerInput').value.trim();
        const btn = this;
        const resultCard = document.getElementById('resultCard');
        
        if (!input) {
            alert("Please paste an offer or upload a document to scan.");
            return;
        }
        
        // Simulate loading
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Analyzing...';
        btn.disabled = true;
        
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
            resultCard.style.display = 'block';
        }, 1500);
    });
}

// ========== FILE UPLOAD MOCK ==========
const fileUpload = document.getElementById('fileUpload');
if (fileUpload) {
    fileUpload.addEventListener('change', function(e) {
        const fileName = e.target.files[0]?.name;
        if (fileName) {
            document.getElementById('analyzerInput').value = `[Document Uploaded: ${fileName}]\n\nPlease wait for analysis...`;
        }
    });
}

// ========== REGISTRATION FORM SUBMISSION ==========
const reportForm = document.getElementById('reportForm');
if (reportForm) {
    reportForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const btn = this.querySelector('button[type="submit"]');
        const originalText = btn.innerText;
        
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Submitting...';
        btn.disabled = true;
        
        setTimeout(() => {
            this.style.display = 'none';
            const reportSuccess = document.getElementById('reportSuccess');
            if (reportSuccess) {
                reportSuccess.style.display = 'block';
            }
        }, 1000);
    });
}

// ========== SPLASH SCREEN & REGISTRATION LOGIC ==========
document.addEventListener('DOMContentLoaded', () => {
    const splash = document.getElementById('splashScreen');
    const regPopupOverlay = document.getElementById('regPopupOverlay');
    const closePopupBtn = document.getElementById('closePopupBtn');
    const ctaRegisterBtn = document.getElementById('ctaRegisterBtn');
    const regPopupForm = document.getElementById('regPopupForm');
    const toast = document.getElementById('toastNotification');
    const isRegistered = localStorage.getItem('realcheck_user_v2');

    // 1. Splash Screen Fade Out after 3 seconds
    setTimeout(() => {
        if (splash) {
            splash.style.opacity = '0';
            splash.style.visibility = 'hidden';
            splash.style.pointerEvents = 'none';
        }
    }, 3000);

    // Modal controls
    if (closePopupBtn) {
        closePopupBtn.addEventListener('click', () => {
            regPopupOverlay.classList.remove('show');
        });
    }

    if (ctaRegisterBtn) {
        ctaRegisterBtn.addEventListener('click', () => {
            regPopupOverlay.classList.add('show');
        });
    }

    window.addEventListener('click', (e) => {
        if (e.target === regPopupOverlay) {
            regPopupOverlay.classList.remove('show');
        }
    });

    // Handle Registration Submit
    if (regPopupForm) {
        regPopupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            // Save state
            localStorage.setItem('realcheck_user_v2', 'registered');
            
            // 1. Close Popup
            regPopupOverlay.classList.remove('show');
            
            // 2. Show Success Toast
            if (toast) {
                toast.classList.add('show');
                // Hide Toast after 4 seconds
                setTimeout(() => {
                    toast.classList.remove('show');
                }, 4000);
            }
        });
    }

    // ========== SCAM ANALYZER FORM HANDLER ==========
    const scamAnalyzerForm = document.getElementById('scamAnalyzerForm');
    const analysisResults = document.getElementById('analysisResults');
    const analyzeSubmitBtn = document.getElementById('analyzeSubmitBtn');
    const riskBadge = document.getElementById('riskBadge');
    const riskScore = document.getElementById('riskScore');
    const reasonsList = document.getElementById('reasonsList');
    const closeResultsBtn = analysisResults ? analysisResults.querySelector('.btn-close') : null;
    const analyzeAnotherBtn = analysisResults ? analysisResults.querySelector('.result-footer .btn') : null;

    const resetAnalyzerView = () => {
        if (analysisResults) {
            analysisResults.style.display = 'none';
        }
        if (scamAnalyzerForm) {
            scamAnalyzerForm.style.display = 'block';
        }
    };

    if (closeResultsBtn) {
        closeResultsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            resetAnalyzerView();
        });
    }

    if (analyzeAnotherBtn) {
        analyzeAnotherBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (scamAnalyzerForm) {
                scamAnalyzerForm.reset();
            }
            resetAnalyzerView();
        });
    }

    if (scamAnalyzerForm && analysisResults && analyzeSubmitBtn && riskBadge && riskScore && reasonsList) {
        scamAnalyzerForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const message = document.getElementById('jobMessage').value.trim();
            const email = document.getElementById('recruiterEmail').value.trim();
            const website = document.getElementById('companyWebsite').value.trim();

            if (!message && !email && !website) {
                alert('Please paste an internship/job message, recruiter email, or website.');
                return;
            }

            const originalText = analyzeSubmitBtn.innerHTML;
            analyzeSubmitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Analyzing...';
            analyzeSubmitBtn.disabled = true;

            try {
                const response = await fetch('http://localhost:5000/api/analyze-job', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message,
                        email,
                        website
                    })
                });

                if (!response.ok) {
                    throw new Error(`API error: ${response.status}`);
                }

                const result = await response.json();

                riskBadge.className = `risk-badge risk-${String(result.risk || 'Low').toLowerCase()}`;
                riskBadge.textContent = `${String(result.risk || 'Low')} Risk`;
                riskScore.textContent = Number.isFinite(result.score) ? String(result.score) : '0';

                reasonsList.innerHTML = '';
                const reasons = Array.isArray(result.reasons) ? result.reasons : [];
                if (reasons.length === 0) {
                    const li = document.createElement('li');
                    li.textContent = 'No obvious red flags detected from the provided details.';
                    reasonsList.appendChild(li);
                } else {
                    reasons.forEach((reason) => {
                        const li = document.createElement('li');
                        li.textContent = reason;
                        reasonsList.appendChild(li);
                    });
                }

                scamAnalyzerForm.style.display = 'none';
                analysisResults.style.display = 'block';
                analysisResults.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } catch (error) {
                console.error('Analysis error:', error);
                alert('Could not analyze right now. Please confirm backend is running on localhost:5000.');
            } finally {
                analyzeSubmitBtn.innerHTML = originalText;
                analyzeSubmitBtn.disabled = false;
            }
        });
    }
});
