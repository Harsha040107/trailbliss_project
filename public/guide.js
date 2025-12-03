// [guide.js] - COMPLETE UPDATED FILE

// 1. CHECK AUTHENTICATION
const currentGuideEmail = localStorage.getItem('userEmail');

if (!currentGuideEmail) {
    alert("Please log in first.");
    window.location.href = "log.html";
}

// --- 2. NAVIGATION LOGIC (Switch Views) ---
// This function hides all sections and shows only the one clicked
function switchView(viewName, element) {
    // 1. Hide all views
    const views = document.querySelectorAll('.view-section');
    views.forEach(view => view.style.display = 'none');

    // 2. Show selected view
    const selectedView = document.getElementById(`view-${viewName}`);
    if (selectedView) {
        selectedView.style.display = 'block';
    }

    // 3. Update Sidebar Active State (Highlight the clicked menu item)
    const menuItems = document.querySelectorAll('.navigationMenuItem');
    menuItems.forEach(item => item.classList.remove('activeItem'));
    if (element) {
        element.classList.add('activeItem');
    }
}


// --- 3. LOAD PROFILE DATA ---
async function loadProfile() {
    try {
        const res = await fetch(`/api/guide-profile?email=${currentGuideEmail}`);
        const profile = await res.json();

        if (profile) {
            // Update Form Inputs
            document.getElementById('pName').value = profile.name || '';
            document.getElementById('pPhone').value = profile.phone || '';
            document.getElementById('pAddress').value = profile.address || '';
            document.getElementById('pBio').value = profile.bio || '';
            document.getElementById('pLang').value = profile.languages || '';
            document.getElementById('pExp').value = profile.experience || '';

            // Update Sidebar Name
            const sidebarName = document.getElementById('sidebarName');
            if (sidebarName) sidebarName.innerText = profile.name || 'Guide';

            // Update Images (Sidebar & Preview)
            if (profile.profileImage) {
                // TRICK: We add ?t=timestamp to the URL.
                // This forces the browser to ignore the cache and show the new image immediately.
                const timestamp = new Date().getTime();
                const imageUrl = `${profile.profileImage}?t=${timestamp}`;

                const previewImg = document.getElementById('previewImage');
                const sidebarImg = document.getElementById('sidebarProfileImage');

                if (previewImg) previewImg.src = imageUrl;
                if (sidebarImg) sidebarImg.src = imageUrl;
            }
        }
    } catch (e) { console.error("Profile load error", e); }
}


// --- 4. HANDLE PROFILE SAVE (With Image) ---
const profileForm = document.getElementById('guideProfileForm');
if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData();
        formData.append('email', currentGuideEmail);
        formData.append('name', document.getElementById('pName').value);
        formData.append('phone', document.getElementById('pPhone').value);
        formData.append('address', document.getElementById('pAddress').value);
        formData.append('bio', document.getElementById('pBio').value);
        formData.append('languages', document.getElementById('pLang').value);
        formData.append('experience', document.getElementById('pExp').value);

        const fileInput = document.getElementById('pPhoto');
        if (fileInput.files[0]) {
            formData.append('profileImage', fileInput.files[0]);
        }

        try {
            const res = await fetch('/api/guide-profile', {
                method: 'POST',
                body: formData
            });

            const result = await res.json();

            if (result.success) {
                alert(result.message);
                // CRITICAL: Reload profile immediately to see the new image without refreshing the page
                loadProfile();
            } else {
                alert("Error: " + result.error);
            }
        } catch (err) {
            console.error(err);
            alert("Failed to save profile.");
        }
    });
}


// --- 5. LOAD BOOKINGS & CHART ---
let myChart = null; // Global variable to hold chart instance

// [guide.js] - REPLACE THE ENTIRE loadBookings FUNCTION

async function loadBookings() {
    try {
        const res = await fetch(`/api/guide-bookings?email=${currentGuideEmail}`);
        const bookings = await res.json();
        
        const scheduleContainer = document.getElementById('scheduleListContainer');
        const feedbackContainer = document.getElementById('feedbackListContainer');
        
        // 1. RESET CONTAINERS
        if (scheduleContainer) scheduleContainer.innerHTML = '';
        if (feedbackContainer) feedbackContainer.innerHTML = '';

        if (bookings.length === 0) {
            if (scheduleContainer) scheduleContainer.innerHTML = '<p style="color:#aaa">No booking requests found.</p>';
            if (feedbackContainer) feedbackContainer.innerHTML = '<p style="color:#aaa">No reviews yet.</p>';
            return;
        }

        let hasReviews = false;

        bookings.forEach(b => {
            // --- A. HANDLE STATUS COLORS ---
            let statusColor = '#f39c12'; // Default (Pending) - Orange
            if (b.status === 'Accepted') statusColor = '#27ae60'; // Green
            if (b.status === 'Rejected') statusColor = '#c0392b'; // Red
            if (b.status === 'Completed') statusColor = '#2980b9'; // Blue

            // --- B. RENDER SCHEDULE CARD ---
            if (scheduleContainer) {
                const html = `
                    <div class="scheduleItemRow" style="border-left: 4px solid ${statusColor}; flex-direction:column; align-items:flex-start;">
                        <div style="display:flex; justify-content:space-between; width:100%">
                            <span style="color:var(--primaryGoldColor)">${b.date}</span>
                            <span style="font-size:0.8rem; background:${statusColor}; color:white; padding:2px 6px; border-radius:4px;">${b.status}</span>
                        </div>
                        <h4 style="margin:5px 0;">Trip to: ${b.spotName}</h4>
                        
                        ${b.status === 'Accepted' || b.status === 'Completed' ? `
                        <div style="margin-top:5px; padding:10px; background:rgba(255,255,255,0.05); width:100%; border-radius:5px;">
                            <p style="color:${statusColor}; font-weight:bold;">Tourist Details:</p>
                            <p>Email: ${b.touristEmail}</p>
                            <p>Phone: ${b.touristPhone || 'Not provided'}</p>
                        </div>` 
                        : `<p style="font-size:0.9rem; color:#ddd;">Tourist Email: ${b.touristEmail}</p>`}
                        
                        ${b.status === 'Pending' ? `
                        <div style="margin-top:10px; display:flex; gap:10px; width:100%">
                            <button onclick="updateStatus('${b._id}', 'Accepted')" class="actionButton" style="background:#27ae60; color:white">Accept</button>
                            <button onclick="updateStatus('${b._id}', 'Rejected')" class="actionButton" style="background:#c0392b; color:white">Reject</button>
                        </div>` : ''}
                    </div>
                `;
                scheduleContainer.innerHTML += html;
            }

            // --- C. RENDER REVIEWS (If Completed) ---
            if (b.status === 'Completed' && b.review) {
                hasReviews = true;
                const starString = '★'.repeat(b.rating || 0) + '☆'.repeat(5 - (b.rating || 0));
                
                const reviewHTML = `
                    <div class="feedbackDisplayItem">
                        <div style="display:flex; justify-content:space-between;">
                            <strong>${b.touristEmail}</strong> <span class="starRatingDisplay" style="color:#D4AF37; letter-spacing:2px;">${starString}</span>
                        </div>
                        <p style="font-size:0.9rem; margin-top:5px; color:#ddd; font-style:italic;">"${b.review}"</p>
                        <p style="font-size:0.7rem; color:#666; margin-top:5px; text-align:right;">Trip to: ${b.spotName} | ${b.date}</p>
                    </div>
                `;
                if(feedbackContainer) feedbackContainer.innerHTML += reviewHTML;
            }
        });
        
        if (!hasReviews && feedbackContainer) {
            feedbackContainer.innerHTML = '<p style="color:#aaa; font-style:italic;">No reviews received yet.</p>';
        }

        updateChart(bookings);
        
    } catch(err) { console.error("Error loading bookings", err); }
}

async function updateStatus(id, status) {
    if (!confirm(`Are you sure you want to ${status} this request?`)) return;

    await fetch('/api/booking-status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status })
    });
    loadBookings(); // Refresh list to update UI
}

// [guide.js] - Inside updateChart function

function updateChart(bookings) {
    // 1. Calculate counts for all 4 statuses
    const completed = bookings.filter(b => b.status === 'Completed').length;
    const accepted = bookings.filter(b => b.status === 'Accepted').length; // Active but not done
    const rejected = bookings.filter(b => b.status === 'Rejected').length;
    const pending = bookings.filter(b => b.status === 'Pending').length;

    const ctx = document.getElementById('performanceChartCanvas');
    if (!ctx) return;

    if (myChart) {
        myChart.destroy();
    }

    myChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            // Added 'Completed' to labels
            labels: ['Completed', 'Accepted (Upcoming)', 'Rejected', 'Pending'],
            datasets: [{
                data: [completed, accepted, rejected, pending],
                backgroundColor: [
                    '#2980b9', // Blue for Completed
                    '#27ae60', // Green for Accepted
                    '#c0392b', // Red for Rejected
                    '#f39c12'  // Orange for Pending
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: 'white' } },
                title: {
                    display: true,
                    text: 'Tour Status Distribution',
                    color: 'white'
                }
            }
        }
    });
}

// 6. INITIALIZATION
// Wait for window to load, then fetch data
window.onload = function () {
    loadProfile();
    loadBookings();
};