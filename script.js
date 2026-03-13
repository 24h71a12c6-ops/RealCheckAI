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

let firebaseAuth = null;
let firestoreDb = null;
let firebaseReady = false;

async function initFirebase() {
    if (firebaseReady || !window.firebase) return firebaseReady;

    try {
        const response = await fetch('/api/firebase-config');
        if (!response.ok) {
            throw new Error(`Firebase config error: ${response.status}`);
        }

        const firebaseConfig = await response.json();

        if (!window.firebase.apps.length) {
            window.firebase.initializeApp(firebaseConfig);
        }

        firebaseAuth = window.firebase.auth();
        firestoreDb = window.firebase.firestore();

        // Keep a signed-in session for Firestore rules that require auth.
        if (!firebaseAuth.currentUser) {
            try {
                await firebaseAuth.signInAnonymously();
            } catch (authError) {
                console.warn('Anonymous Firebase sign-in failed:', authError.message);
            }
        }

        firebaseReady = true;
    } catch (error) {
        console.warn('Firebase initialization skipped:', error.message);
    }

    return firebaseReady;
}

async function saveAnalysisToFirestore(payload, result) {
    if (!firebaseReady || !firestoreDb) return;

    try {
        const user = firebaseAuth ? firebaseAuth.currentUser : null;
        const uid = user ? user.uid : null;

        if (!uid) return;

        await firestoreDb.collection('analyses').add({
            uid,
            rawText: payload.rawText || '',
            jobMessage: payload.rawText || payload.message || '',
            recruiterEmail: result.recruiter_email || payload.email || '',
            companyWebsite: result.company_website || payload.website || '',
            risk: result.risk || 'Low',
            score: Number.isFinite(result.score) ? result.score : 0,
            reasons: Array.isArray(result.reasons) ? result.reasons : [],
            createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.warn('Could not save analysis to Firestore:', error.message);
    }
}

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

// ========== SKILL ROADMAP DATA ==========
const skillRoadmap = {
    "Web Developer": [
        { skill: "HTML/CSS",        title: "HTML & CSS Full Course",     link: "https://www.youtube.com/watch?v=mU6anWqZJcc" },
        { skill: "JavaScript",     title: "Modern JS for Beginners",    link: "https://www.youtube.com/watch?v=jS4aFq5-91M" },
        { skill: "React",          title: "React JS Crash Course",       link: "https://www.youtube.com/watch?v=bMknfKXIFA8" }
    ],
    "Data Analyst": [
        { skill: "Excel",          title: "Advanced Excel Tutorial",     link: "https://www.youtube.com/watch?v=Vl0hux8aHY0" },
        { skill: "SQL",            title: "SQL Full Course",              link: "https://www.youtube.com/watch?v=HXV3zePRqGY" },
        { skill: "Python",         title: "Python for Data Science",     link: "https://www.youtube.com/watch?v=rfscVS0vtbw" }
    ],
    "AI/ML Engineer": [
        { skill: "Python",         title: "Python for AI",               link: "https://www.youtube.com/watch?v=NWONeJKn6kc" },
        { skill: "Maths",          title: "Linear Algebra for ML",       link: "https://www.youtube.com/watch?v=u0TIDZ-I690" },
        { skill: "Neural Networks",title: "Deep Learning Specialization",link: "https://www.youtube.com/watch?v=aircAruvnKk" }
    ]
};

function analyzeGap() {
    const skillsEl   = document.getElementById('current-skills');
    const roleEl     = document.getElementById('target-role');
    const resultsEl  = document.getElementById('analysis-results');
    const courseList = document.getElementById('course-list');
    const gapForm    = document.querySelector('.skill-gap-form');

    const currentSkills = skillsEl ? skillsEl.value : '';
    const targetRole    = roleEl  ? roleEl.value  : '';

    if (!currentSkills.trim()) {
        alert('Please enter your current skills.');
        return;
    }

    const skillsLower = currentSkills.toLowerCase();
    const required    = skillRoadmap[targetRole] || [];
    const missing     = required.filter(item => !skillsLower.includes(item.skill.toLowerCase()));

    if (!resultsEl || !courseList) return;
    courseList.innerHTML = '';

    if (missing.length > 0) {
        missing.forEach(item => {
            courseList.innerHTML += `
                <div class="course-card glass">
                    <div class="course-badge">Free Course</div>
                    <h4>Missing Skill: ${item.skill}</h4>
                    <p>${item.title}</p>
                    <a href="${item.link}" target="_blank" rel="noopener noreferrer" class="watch-btn">
                        <i class="fab fa-youtube"></i> Watch on YouTube
                    </a>
                </div>`;
        });
    } else {
        courseList.innerHTML = '<p class="success-msg">You are job-ready for this role! 🎉</p>';
    }

    if (gapForm) gapForm.style.display = 'none';
    resultsEl.style.display = 'block';
    resultsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

window.analyzeGap = analyzeGap;

// ========== SPLASH SCREEN & REGISTRATION LOGIC ==========
document.addEventListener('DOMContentLoaded', () => {
    const splash = document.getElementById('splashScreen');
    const regPopupOverlay = document.getElementById('regPopupOverlay');
    const closePopupBtn = document.getElementById('closePopupBtn');
    const ctaRegisterBtn = document.getElementById('ctaRegisterBtn');
    const regPopupForm = document.getElementById('regPopupForm');
    const isRegistered = localStorage.getItem('realcheck_user_v2');

    initFirebase();

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
        regPopupForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const popupInputs = regPopupForm.querySelectorAll('.popup-input');
            const fullName = popupInputs[0]?.value?.trim() || '';
            const email = popupInputs[1]?.value?.trim() || '';
            const password = popupInputs[2]?.value || '';
            const confirmPassword = popupInputs[3]?.value || '';

            if (password && confirmPassword && password !== confirmPassword) {
                alert('Password and confirm password do not match.');
                return;
            }

            // Attempt Firebase email signup if available.
            if (firebaseReady && firebaseAuth && firestoreDb && email && password) {
                try {
                    const cred = await firebaseAuth.createUserWithEmailAndPassword(email, password);
                    await firestoreDb.collection('users').doc(cred.user.uid).set({
                        name: fullName,
                        email,
                        provider: 'password',
                        createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                } catch (authError) {
                    console.warn('Firebase registration issue:', authError.message);
                }
            }
            
            // Save state
            localStorage.setItem('realcheck_user_v2', 'registered');
            
            // 1. Close Popup
            regPopupOverlay.classList.remove('show');
            

        });
    }

    // ========== SCAM ANALYZER (DUAL-INPUT: TEXT + OCR) ==========

    let _analyzerMode = 'text-tab';

    window.switchTab = function switchTab(tabId, event) {
        _analyzerMode = tabId;
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const tabEl = document.getElementById(tabId);
        if (tabEl) tabEl.classList.add('active');
        if (event && event.currentTarget) event.currentTarget.classList.add('active');
    };

    window.previewImage = function previewImage(event) {
        const file = event.target.files[0];
        const preview = document.getElementById('img-preview');
        if (!file || !preview) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            preview.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    };

    function detectScamLogic(text) {
        const resultDiv  = document.getElementById('detection-result');
        const statusEl   = document.getElementById('result-status');
        const detailsEl  = document.getElementById('risk-details');
        const riskBadge  = document.getElementById('riskBadge');
        const riskScore  = document.getElementById('riskScore');
        const reasonsList= document.getElementById('reasonsList');

        if (!resultDiv) return;

        const scamWords = [
            'registration fee', 'training fee', 'security deposit',
            'whatsapp to', 'telegram to', 'batch code',
            'pay to apply', 'joining fee', 'guaranteed salary',
            'earn from home', 'no experience needed'
        ];

        const lowerText = String(text || '').toLowerCase();
        let score = 0;
        const found = [];

        scamWords.forEach(word => {
            if (lowerText.includes(word)) {
                score = Math.min(score + 20, 100);
                found.push(word);
            }
        });

        if (riskBadge) {
            riskBadge.className = score >= 60 ? 'risk-badge risk-high'
                : score >= 30 ? 'risk-badge risk-medium'
                : 'risk-badge risk-low';
            riskBadge.textContent = score >= 60 ? 'High Risk'
                : score >= 30 ? 'Medium Risk' : 'Low Risk';
        }
        if (riskScore) riskScore.textContent = String(score);

        if (statusEl) {
            if (score >= 40) {
                statusEl.innerHTML = '⚠ High Risk: Suspicious Offer';
                statusEl.style.color = '#f87171';
            } else {
                statusEl.innerHTML = '✅ Low Risk: Looks Legitimate';
                statusEl.style.color = '#4ade80';
            }
        }

        if (detailsEl) {
            detailsEl.textContent = `Risk Score: ${score}% | Detected Signals: ${found.length > 0 ? found.join(', ') : 'None'}`;
        }

        if (reasonsList) {
            reasonsList.innerHTML = '';
            if (found.length > 0) {
                found.forEach(w => {
                    const li = document.createElement('li');
                    li.textContent = w;
                    reasonsList.appendChild(li);
                });
            } else {
                const li = document.createElement('li');
                li.textContent = 'No obvious scam signals detected.';
                reasonsList.appendChild(li);
            }
        }

        resultDiv.style.display = 'block';
        resultDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    window.startAnalysis = async function startAnalysis() {
        const resultDiv = document.getElementById('detection-result');
        const analyzeBtn = document.querySelector('.analyze-now-btn');
        const originalLabel = analyzeBtn ? analyzeBtn.textContent : '';

        if (analyzeBtn) {
            analyzeBtn.textContent = '⏳ Processing...';
            analyzeBtn.disabled = true;
        }
        if (resultDiv) resultDiv.style.display = 'none';

        try {
            if (_analyzerMode === 'text-tab') {
                const textEl = document.getElementById('job-text');
                const text = textEl ? textEl.value.trim() : '';
                if (!text) { alert('Please paste some job details first.'); return; }
                detectScamLogic(text);

                // Also hit the backend for deeper analysis
                try {
                    const resp = await fetch('/api/analyze-job', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ rawText: text })
                    });
                    if (resp.ok) {
                        const result = await resp.json();
                        const riskBadge = document.getElementById('riskBadge');
                        const riskScore = document.getElementById('riskScore');
                        const reasonsList = document.getElementById('reasonsList');
                        if (riskBadge) {
                            riskBadge.className = `risk-badge risk-${String(result.risk || 'Low').toLowerCase()}`;
                            riskBadge.textContent = `${String(result.risk || 'Low')} Risk`;
                        }
                        if (riskScore) riskScore.textContent = Number.isFinite(result.score) ? String(result.score) : '0';
                        if (reasonsList) {
                            reasonsList.innerHTML = '';
                            const reasons = Array.isArray(result.reasons) ? result.reasons : [];
                            reasons.forEach(r => { const li = document.createElement('li'); li.textContent = r; reasonsList.appendChild(li); });
                        }
                        await initFirebase();
                        await saveAnalysisToFirestore({ rawText: text }, result);
                    }
                } catch (_) { /* backend unreachable — local result already shown */ }

            } else {
                const fileInput = document.getElementById('job-image');
                if (!fileInput || fileInput.files.length === 0) {
                    alert('Please upload an image first!');
                    return;
                }
                if (typeof Tesseract === 'undefined') {
                    alert('OCR library is loading. Please wait a moment and try again.');
                    return;
                }
                const { data: { text } } = await Tesseract.recognize(fileInput.files[0], 'eng', {
                    logger: () => {}
                });
                detectScamLogic(text);
            }
        } finally {
            if (analyzeBtn) {
                analyzeBtn.textContent = originalLabel;
                analyzeBtn.disabled = false;
            }
        }
    };

    // ========== REMOTE JOBS LOADER ==========
    const dummyRemoteJobs = [
        {
            position: 'Frontend Developer Intern',
            company: 'TechVision AI',
            location: 'Remote',
            description: 'Work on responsive UI components, reusable frontend modules, and collaborate with designers to improve user experience.',
            apply_url: '#',
            salary: '₹15,000 / month',
            tags: ['Internship', 'Frontend', 'JavaScript'],
            riskScore: 12,
            status: 'Safe',
            role: 'internship'
        },
        {
            position: 'Backend Node.js Developer',
            company: 'SecureNet Systems',
            location: 'Hyderabad, India',
            description: 'Build APIs, optimize database queries, and manage backend services focused on reliability and security.',
            apply_url: '#',
            salary: '₹8 - 12 LPA',
            tags: ['Backend', 'Node.js', 'APIs'],
            riskScore: 85,
            status: 'Suspicious',
            role: 'backend developer'
        },
        {
            position: 'Data Analyst',
            company: 'DataFlow Corp',
            location: 'Remote',
            description: 'Analyze campaign and user data, prepare dashboards, and generate actionable insights for product teams.',
            apply_url: '#',
            salary: '₹6 - 8 LPA',
            tags: ['SQL', 'Excel', 'Analytics'],
            riskScore: 25,
            status: 'Safe',
            role: 'data analyst'
        }
    ];

    let allRemoteJobs = [];
    let currentDisplayedJobs = [];
    let currentJobsDomain = 'all';
    let jobsExpanded = false;

    const jobModal = document.getElementById('jobModal');
    const jobModalBody = document.getElementById('modal-body');
    const closeJobModalBtn = document.getElementById('closeJobModal');

    function getRemoteJobsEndpoints() {
        const endpoints = ['http://localhost:5000/api/remote-jobs', '/api/remote-jobs'];
        return [...new Set(endpoints)];
    }

    function getJobsContainer() {
        return document.getElementById('jobs-container') || document.getElementById('jobsContainer');
    }

    function normalizeJob(job) {
        return {
            position: job.position || job.job_title || 'Untitled Role',
            company: job.company || job.company_name || 'Unknown Company',
            location: job.location || 'Remote',
            description: job.description || job.job_description || '',
            apply_url: job.apply_url || job.url || '#',
            salary: job.salary || null,
            tags: Array.isArray(job.tags) ? job.tags : [],
            riskScore: Number.isFinite(job.riskScore) ? job.riskScore : (Number.isFinite(job.risk_score) ? job.risk_score : 0),
            status: job.status || 'Safe',
            role: (job.role || '').toLowerCase()
        };
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatJobDescription(description) {
        const raw = String(description || '').trim();
        if (!raw) return 'No description provided by the employer.';
        return raw;
    }

    function showJobDetails(jobIndex) {
        const job = currentDisplayedJobs[jobIndex];
        if (!job || !jobModal || !jobModalBody) return;

        jobModalBody.innerHTML = `
            <div class="modal-header">
                <h2 style="color: var(--navy);">${escapeHtml(job.position)}</h2>
                <span class="company-tag">${escapeHtml(job.company)}</span>
            </div>
            <hr>
            <div class="job-full-details">
                <p><strong>Location:</strong> ${escapeHtml(job.location)}</p>
                <p><strong>Category:</strong> ${escapeHtml(job.role || 'general')}</p>
                <div class="description-box">
                    ${formatJobDescription(job.description)}
                </div>
                <center>
                    <a href="${escapeHtml(job.apply_url)}" target="_blank" rel="noopener noreferrer" class="apply-btn-large apply-btn-main">Apply on RemoteOK</a>
                </center>
            </div>
        `;

        jobModal.style.display = 'flex';
    }

    function closeModal() {
        if (jobModal) {
            jobModal.style.display = 'none';
        }
    }

    window.openModal = showJobDetails;
    window.closeModal = closeModal;

    function getFilteredRemoteJobs(domain) {
        if (domain === 'all') {
            return allRemoteJobs;
        }

        return allRemoteJobs.filter((job) => {
            const role = String(job.role || '').toLowerCase();
            const position = String(job.position || '').toLowerCase();
            return role === domain || position.includes(domain);
        });
    }

    function getInitialVisibleJobsCount() {
        const container = getJobsContainer();
        if (!container) return 6;

        const columns = getComputedStyle(container)
            .gridTemplateColumns
            .split(' ')
            .filter(Boolean)
            .length;

        const safeColumns = Math.max(columns || 1, 1);
        return safeColumns * 2;
    }

    function updateShowMoreButton(totalCount) {
        const showMoreJobsBtn = document.getElementById('showMoreJobsBtn');
        if (!showMoreJobsBtn) return;

        const shouldShow = !jobsExpanded && totalCount > getInitialVisibleJobsCount();
        showMoreJobsBtn.style.display = shouldShow ? 'inline-flex' : 'none';
    }

    async function loadRemoteJobs() {
        const container = getJobsContainer();
        if (!container) return;

        for (const endpoint of getRemoteJobsEndpoints()) {
            try {
                const res = await fetch(endpoint);
                if (!res.ok) {
                    throw new Error(`API ${res.status}`);
                }

                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    allRemoteJobs = data.map(normalizeJob);
                    renderRemoteJobs('all');
                    return;
                }
            } catch (err) {
                console.warn(`Jobs fetch failed for ${endpoint}:`, err.message);
            }
        }

        console.warn('Using dummy jobs because API data was unavailable or empty.');
        allRemoteJobs = dummyRemoteJobs.map(normalizeJob);
        renderRemoteJobs('all');
    }

    function renderRemoteJobs(domain) {
        const container = getJobsContainer();
        if (!container) return;

        const filtered = getFilteredRemoteJobs(domain);
        const visibleJobs = jobsExpanded ? filtered : filtered.slice(0, getInitialVisibleJobsCount());
        currentDisplayedJobs = visibleJobs;

        if (filtered.length === 0) {
            container.innerHTML = '<div class="jobs-empty">No jobs found for this category right now.</div>';
            updateShowMoreButton(0);
            return;
        }

        container.innerHTML = visibleJobs.map((job, index) => {
            const tagClass = job.riskScore >= 60 ? 'danger' : job.riskScore >= 30 ? 'warning' : 'safe';
            const tagsHtml = (job.tags || []).slice(0, 4)
                .map(t => `<span class="job-tag-pill">${t}</span>`)
                .join('');
            const salaryHtml = job.salary
                ? `<span class="job-dynamic-salary">${job.salary}</span>`
                : '<span></span>';
            return `
                            <div class="job-dynamic-card job-card" data-job-index="${index}" onclick="openModal(${index})">
                <div class="job-dynamic-header">
                  <h3>${job.position}</h3>
                  <span class="risk-tag ${tagClass}">${job.status}</span>
                </div>
                                <p class="job-dynamic-company" style="color: var(--orange);"><i class="fa-solid fa-building"></i> ${job.company}</p>
                <p class="job-dynamic-location"><i class="fa-solid fa-location-dot"></i> ${job.location}</p>
                ${tagsHtml ? `<div class="job-dynamic-tags">${tagsHtml}</div>` : ''}
                <div class="job-dynamic-footer">
                  ${salaryHtml}
                  <div class="job-card-actions">
                                        <button type="button" class="btn btn-secondary btn-sm view-job-btn view-btn" data-job-index="${index}">View Details</button>
                    <a href="${job.apply_url}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm">Apply on RemoteOK</a>
                  </div>
                </div>
              </div>`;
        }).join('');

        container.querySelectorAll('.view-job-btn').forEach((btn) => {
            btn.addEventListener('click', (event) => {
                event.stopPropagation();
                const index = Number(btn.getAttribute('data-job-index'));
                showJobDetails(index);
            });
        });

        container.querySelectorAll('.job-dynamic-card').forEach((card) => {
            card.addEventListener('click', (event) => {
                if (event.target.closest('a') || event.target.closest('button')) return;
                const index = Number(card.getAttribute('data-job-index'));
                showJobDetails(index);
            });
        });

        updateShowMoreButton(filtered.length);
    }

    if (closeJobModalBtn) {
        closeJobModalBtn.addEventListener('click', () => {
            closeModal();
        });
    }

    window.addEventListener('click', (event) => {
        if (event.target === jobModal) {
            closeModal();
        }
    });

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && jobModal && (jobModal.style.display === 'block' || jobModal.style.display === 'flex')) {
            closeModal();
        }
    });

    document.querySelectorAll('.domain-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.domain-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
                                currentJobsDomain = btn.dataset.domain;
                                jobsExpanded = false;
                                renderRemoteJobs(currentJobsDomain);
        });
    });

                        const showMoreJobsBtn = document.getElementById('showMoreJobsBtn');
                        if (showMoreJobsBtn) {
                            showMoreJobsBtn.addEventListener('click', () => {
                                jobsExpanded = true;
                                renderRemoteJobs(currentJobsDomain);
                            });
                        }

                        window.addEventListener('resize', () => {
                            if (!jobsExpanded && allRemoteJobs.length > 0) {
                                renderRemoteJobs(currentJobsDomain);
                            }
                        });

    async function loadJobs() {
        await loadRemoteJobs();
    }

    window.loadJobs = loadJobs;
    loadJobs();

    // ========== SKILL GAP ANALYZER ==========
    const skillGapForm = document.querySelector('.skill-gap-form');
    const skillGapBackBtn = document.getElementById('skillGapBackBtn');

    if (skillGapBackBtn) {
        skillGapBackBtn.addEventListener('click', () => {
            const resultsEl  = document.getElementById('analysis-results');
            const courseList = document.getElementById('course-list');
            const skillsEl  = document.getElementById('current-skills');
            const roleEl    = document.getElementById('target-role');
            if (resultsEl)  resultsEl.style.display = 'none';
            if (courseList) courseList.innerHTML = '';
            if (skillsEl)   skillsEl.value = '';
            if (roleEl)     roleEl.selectedIndex = 0;
            if (skillGapForm) skillGapForm.style.display = 'grid';
            if (resultsEl) {
                const card = resultsEl.closest('.skill-gap-card');
                if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }
});
