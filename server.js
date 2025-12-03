require('dotenv').config(); // Load env vars for local testing
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcrypt');
const fs = require('fs');
const nodemailer = require('nodemailer');

const app = express();
// RENDER REQUIREMENT: Use process.env.PORT, default to 3000 for local
const PORT = process.env.PORT || 3000; 

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- MONGODB CONNECTION ---
// Uses the variable you set in Render Dashboard
mongoose.connect(process.env.MONGO_URI) 
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch((err) => console.log("❌ MongoDB Connection Error:", err));

// --- SCHEMAS ---

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, required: true, enum: ['tourist', 'guide'] }
});
const User = mongoose.model('User', userSchema);

const spotSchema = new mongoose.Schema({
    state: String,
    name: String,
    category: String,
    image: String,
    desc: String,
    lat: Number, 
    lng: Number
});
const TouristSpot = mongoose.model('TouristSpot', spotSchema);

const feedbackSchema = new mongoose.Schema({
    name: String,
    email: String,
    message: String,
    date: { type: Date, default: Date.now }
});
const Feedback = mongoose.model('Feedback', feedbackSchema);

const guideProfileSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true }, 
    name: String,
    bio: String,
    experience: String,
    languages: String,
    phone: String,
    profileImage: String,
    rating: { type: Number, default: 0 },
    reviewsCount: { type: Number, default: 0 }
});
const GuideProfile = mongoose.model('GuideProfile', guideProfileSchema);

const bookingSchema = new mongoose.Schema({
    touristEmail: String,
    touristPhone: String,
    guideEmail: String,
    spotName: String,
    date: String,
    type: String,
    status: { type: String, default: 'Pending' },
    rating: { type: Number, default: 0 },
    review: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now }
});
const Booking = mongoose.model('Booking', bookingSchema);

// --- OTP SCHEMA (Better than in-memory for Render) ---
const otpSchema = new mongoose.Schema({
    email: String,
    code: String,
    createdAt: { type: Date, default: Date.now, expires: 300 } // Expires in 5 mins
});
const OTP = mongoose.model('OTP', otpSchema);


// --- MULTER CONFIGURATION ---
// WARNING: On Render Free Tier, these files will disappear after 15 mins or redeploy.
// For production, you should use Cloudinary or AWS S3.
const storage = multer.diskStorage({
    destination: path.join(__dirname, 'public', 'uploads'),
    filename: function (req, file, cb) {
        cb(null, 'spot-' + Date.now() + path.extname(file.originalname));
    }
});
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
    storage: storage,
    limits: { fileSize: 5000000 },
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png|gif/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb('Error: Images Only!');
        }
    }
});


// --- NODEMAILER CONFIGURATION ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, // Reads from Render Environment Variables
        pass: process.env.EMAIL_PASS  // Reads from Render Environment Variables
    }
});


// ================= ROUTES =================

// 1. AUTH ROUTES
app.post('/api/register', async (req, res) => {
    try {
        const { email, password, role } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: "User already exists with this email" });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ email, password: hashedPassword, role });
        await newUser.save();
        res.json({ success: true, message: "Registration successful! Please login." });
    } catch (error) {
        res.status(500).json({ error: "Registration failed" });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password, role } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: "User not found" });
        
        if (user.role !== role) {
            return res.status(403).json({ error: `Please log in via the ${user.role} tab.` });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: "Invalid password" });

        res.json({ success: true, message: "Login successful", role: user.role });
    } catch (error) {
        res.status(500).json({ error: "Login failed" });
    }
});

// 2. SPOT ROUTES
app.get('/api/spots', async (req, res) => {
    try {
        const spots = await TouristSpot.find();
        res.json(spots);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch spots" });
    }
});

app.post('/api/spots', (req, res) => {
    const uploadFunc = upload.single('image');
    uploadFunc(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message || err });
        try {
            if (!req.file) return res.status(400).json({ error: "No file uploaded" });

            const imagePath = '/uploads/' + req.file.filename;
            const newSpot = new TouristSpot({
                state: req.body.state,
                name: req.body.name,
                category: req.body.category,
                image: imagePath,
                desc: req.body.desc,
                lat: req.body.lat,
                lng: req.body.lng
            });
            await newSpot.save();
            res.json({ success: true, message: "Spot added successfully!" });
        } catch (dbError) {
            res.status(500).json({ error: dbError.message });
        }
    });
});

app.delete('/api/spots/:id', async (req, res) => {
    try {
        await TouristSpot.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Spot deleted!" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete spot" });
    }
});

// 3. VERIFICATION ROUTES (Fixed for Render)
app.post('/api/send-verification', async (req, res) => {
    const { email } = req.body;
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    try {
        // Save to DB instead of memory (Render restarts often)
        await OTP.findOneAndDelete({ email }); // Clear old code
        await new OTP({ email, code: verificationCode }).save();

        const mailOptions = {
            from: `Trail Bliss <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Verify your Trail Bliss Account',
            text: `Your verification code is: ${verificationCode}`
        };

        await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${email}`);
        res.json({ success: true, message: "Code sent" });
    } catch (error) {
        console.error("Email Error:", error);
        res.status(400).json({ error: "Could not send email." });
    }
});

app.post('/api/verify-code', async (req, res) => {
    const { email, code } = req.body;
    const record = await OTP.findOne({ email, code });
    
    if (record) {
        await OTP.deleteOne({ _id: record._id }); // Use once
        res.json({ success: true });
    } else {
        res.status(400).json({ error: "Invalid or Expired Code" });
    }
});

// 4. FEEDBACK ROUTES
app.post('/api/feedback', async (req, res) => {
    try {
        const { name, email, message } = req.body;
        const newFeedback = new Feedback({ name, email, message });
        await newFeedback.save();
        res.json({ success: true, message: "Feedback saved!" });
    } catch (error) {
        res.status(500).json({ error: "Failed to save feedback" });
    }
});

app.get('/api/view-feedback', async (req, res) => {
    const messages = await Feedback.find().sort({ date: -1 });
    res.json(messages);
});

// 5. GUIDE ROUTES
app.get('/api/guides', async (req, res) => {
    try {
        const guides = await GuideProfile.find();
        res.json(guides);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/guide-profile', async (req, res) => {
    const { email } = req.query;
    try {
        let profile = await GuideProfile.findOne({ email });
        if (!profile) {
            profile = new GuideProfile({ email, name: 'New Guide' });
            await profile.save();
        }
        res.json(profile);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/guide-profile', (req, res) => {
    const uploadFunc = upload.single('profileImage');
    uploadFunc(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        try {
            const { email, name, bio, languages, experience, phone, address } = req.body;
            const updateData = { name, bio, languages, experience, phone, address };
            
            if (req.file) {
                updateData.profileImage = '/uploads/' + req.file.filename;
            }
            await GuideProfile.findOneAndUpdate({ email }, updateData, { upsert: true, new: true });
            res.json({ success: true, message: "Profile Updated" });
        } catch (dbError) {
            res.status(500).json({ error: dbError.message });
        }
    });
});

app.get('/api/guide-bookings', async (req, res) => {
    const { email } = req.query;
    try {
        const bookings = await Booking.find({ guideEmail: email, type: 'offline' }).sort({ createdAt: -1 });
        res.json(bookings);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 6. BOOKING ROUTES
app.post('/api/book', async (req, res) => {
    try {
        const newBooking = new Booking(req.body);
        await newBooking.save();
        res.json({ success: true, message: "Booking Request Sent!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/booking-status', async (req, res) => {
    const { id, status } = req.body;
    try {
        await Booking.findByIdAndUpdate(id, { status });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/complete-trip', async (req, res) => {
    const { bookingId, rating, review } = req.body;
    try {
        await Booking.findByIdAndUpdate(bookingId, {
            status: 'Completed',
            rating: parseInt(rating),
            review: review
        });
        res.json({ success: true, message: "Trip completed and feedback saved!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/tourist-bookings', async (req, res) => {
    const { email } = req.query;
    try {
        const bookings = await Booking.find({ touristEmail: email }).sort({ createdAt: -1 });
        const enhancedBookings = await Promise.all(bookings.map(async (b) => {
            const guide = await GuideProfile.findOne({ email: b.guideEmail });
            let contactInfo = "Hidden until accepted";
            if (b.status === 'Accepted' && guide) {
                contactInfo = guide.phone || guide.email;
            }
            return {
                ...b._doc,
                guideName: guide ? guide.name : "Unknown Guide",
                guideContact: contactInfo
            };
        }));
        res.json(enhancedBookings);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- SERVER START ---
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
