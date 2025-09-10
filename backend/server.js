// backend/server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Ensure directories exist
const reportsDir = path.join(__dirname, 'reports');
const videosDir = path.join(__dirname, 'videos');
if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
}
if (!fs.existsSync(videosDir)) {
    fs.mkdirSync(videosDir, { recursive: true });
}

// Store reports in memory (in production, use a database)
let reports = [];

// Load existing reports from files on server start
try {
    const files = fs.readdirSync(reportsDir);
    files.forEach(file => {
        if (file.endsWith('.json')) {
            const filePath = path.join(reportsDir, file);
            const data = fs.readFileSync(filePath, 'utf8');
            const report = JSON.parse(data);
            reports.push(report);
        }
    });
    console.log(`Loaded ${reports.length} existing reports`);
} catch (error) {
    console.log('No existing reports found or error loading them');
}

// API Routes

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Server is running',
        reportsCount: reports.length
    });
});

// Get all reports
app.get('/api/reports', (req, res) => {
    try {
        // Sort by timestamp descending (newest first)
        const sortedReports = [...reports].sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
        );
        res.json(sortedReports);
    } catch (error) {
        console.error('Error fetching reports:', error);
        res.status(500).json({ error: 'Failed to fetch reports' });
    }
});

// Get a specific report by ID
app.get('/api/reports/:id', (req, res) => {
    try {
        const report = reports.find(r => r.id === req.params.id);
        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }
        res.json(report);
    } catch (error) {
        console.error('Error fetching report:', error);
        res.status(500).json({ error: 'Failed to fetch report' });
    }
});

// Save a new report
app.post('/api/reports', (req, res) => {
    try {
        const {
            candidateName,
            interviewDuration,
            startTime,
            endTime,
            focusIssues,
            prohibitedItems,
            integrityScore,
            events
        } = req.body;

        const report = {
            id: generateId(),
            timestamp: new Date().toISOString(),
            candidateName: candidateName || 'Test Candidate',
            interviewDuration: interviewDuration || '00:00:00',
            startTime: startTime || new Date().toISOString(),
            endTime: endTime || new Date().toISOString(),
            focusIssues: focusIssues || {
                lookAwayCount: 0,
                noFaceCount: 0,
                multipleFacesCount: 0
            },
            prohibitedItems: prohibitedItems || {
                phonesDetected: 0,
                booksDetected: 0,
                devicesDetected: 0
            },
            integrityScore: integrityScore || 100,
            events: events || []
        };

        reports.push(report);
        
        // Save to file
        saveReportToFile(report);
        
        res.status(201).json({ 
            success: true,
            message: 'Report saved successfully', 
            id: report.id 
        });
    } catch (error) {
        console.error('Error saving report:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to save report' 
        });
    }
});

// Save video recording
app.post('/api/videos', (req, res) => {
    try {
        const { videoData, reportId } = req.body;
        
        if (!videoData) {
            return res.status(400).json({ error: 'No video data provided' });
        }
        
        // Convert base64 to buffer
        const videoBuffer = Buffer.from(videoData, 'base64');
        const filename = `video-${reportId || generateId()}.webm`;
        const filepath = path.join(videosDir, filename);
        
        // Save video file
        fs.writeFileSync(filepath, videoBuffer);
        
        res.json({ 
            success: true,
            message: 'Video saved successfully',
            filename: filename
        });
    } catch (error) {
        console.error('Error saving video:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to save video' 
        });
    }
});

// Get video by filename
app.get('/api/videos/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filepath = path.join(videosDir, filename);
        
        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ error: 'Video not found' });
        }
        
        // Set appropriate headers
        res.setHeader('Content-Type', 'video/webm');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        
        // Stream the video file
        const videoStream = fs.createReadStream(filepath);
        videoStream.pipe(res);
    } catch (error) {
        console.error('Error fetching video:', error);
        res.status(500).json({ error: 'Failed to fetch video' });
    }
});

// Download report as file
app.get('/api/reports/:id/download', (req, res) => {
    try {
        const report = reports.find(r => r.id === req.params.id);
        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }
        
        const reportContent = generateReportContent(report);
        const filename = `proctoring-report-${report.id}.txt`;
        
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'text/plain');
        res.send(reportContent);
    } catch (error) {
        console.error('Error downloading report:', error);
        res.status(500).json({ error: 'Failed to download report' });
    }
});

// Delete a report
app.delete('/api/reports/:id', (req, res) => {
    try {
        const reportIndex = reports.findIndex(r => r.id === req.params.id);
        if (reportIndex === -1) {
            return res.status(404).json({ error: 'Report not found' });
        }
        
        // Remove from memory
        reports.splice(reportIndex, 1);
        
        // Remove from file system
        const filename = `report-${req.params.id}.json`;
        const filepath = path.join(reportsDir, filename);
        
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
        }
        
        res.json({ 
            success: true,
            message: 'Report deleted successfully' 
        });
    } catch (error) {
        console.error('Error deleting report:', error);
        res.status(500).json({ error: 'Failed to delete report' });
    }
});

// Helper functions

// Generate a unique ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Save report to file
function saveReportToFile(report) {
    try {
        const filename = `report-${report.id}.json`;
        const filepath = path.join(reportsDir, filename);
        fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
    } catch (error) {
        console.error('Error saving report to file:', error);
    }
}

// Generate report content for download
function generateReportContent(report) {
    return `
=== INTERVIEWGUARD PRO - PROCTORING REPORT ===
Report ID: ${report.id}
Generated: ${new Date(report.timestamp).toLocaleString()}

--- CANDIDATE INFORMATION ---
Name: ${report.candidateName}
Interview Duration: ${report.interviewDuration}
Start Time: ${new Date(report.startTime).toLocaleString()}
End Time: ${new Date(report.endTime).toLocaleString()}

--- FOCUS ANALYSIS ---
Times looked away: ${report.focusIssues.lookAwayCount}
Times no face detected: ${report.focusIssues.noFaceCount}
Multiple faces detected: ${report.focusIssues.multipleFacesCount}

--- PROHIBITED ITEMS DETECTED ---
Mobile phones: ${report.prohibitedItems.phonesDetected}
Books/notes: ${report.prohibitedItems.booksDetected}
Other devices: ${report.prohibitedItems.devicesDetected}

--- FINAL ASSESSMENT ---
Integrity Score: ${report.integrityScore}/100
${getScoreDescription(report.integrityScore)}

Recommendation: ${getRecommendation(report.integrityScore)}

=== DETAILED EVENT LOG ===
${(report.events || []).map(event => `[${event.timestamp}] ${event.message}`).join('\n')}

=============================================
InterviewGuard Pro - AI-Powered Proctoring System
    `;
}

// Helper function to get score description
function getScoreDescription(score) {
    if (score >= 90) return "EXCELLENT - No significant issues detected";
    if (score >= 70) return "GOOD - Minor focus issues observed";
    if (score >= 50) return "FAIR - Several focus and integrity concerns";
    return "POOR - Significant integrity issues detected";
}

// Helper function to get recommendation
function getRecommendation(score) {
    if (score >= 80) return "RECOMMENDED - Candidate maintained good focus and integrity throughout the interview.";
    if (score >= 60) return "CONDITIONALLY RECOMMENDED - Some focus issues were observed but may not disqualify the candidate.";
    return "NOT RECOMMENDED - Significant integrity issues suggest the interview may not reflect the candidate's authentic abilities.";
}

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
    });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({ 
        success: false,
        error: 'API endpoint not found' 
    });
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../Frontend/index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`API health check: http://localhost:${PORT}/api/health`);
});