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
app.use(express.static('public'));

// Ensure reports directory exists
const reportsDir = path.join(__dirname, 'reports');
if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
}

// Store reports in memory (in production, use a database)
let reports = [];

// API Routes

// Get all reports
app.get('/api/reports', (req, res) => {
    res.json(reports);
});

// Get a specific report by ID
app.get('/api/reports/:id', (req, res) => {
    const report = reports.find(r => r.id === req.params.id);
    if (!report) {
        return res.status(404).json({ error: 'Report not found' });
    }
    res.json(report);
});

// Save a new report
app.post('/api/reports', (req, res) => {
    try {
        const report = {
            id: generateId(),
            timestamp: new Date().toISOString(),
            ...req.body,
            events: req.body.events || []
        };

        reports.push(report);
        
        // Also save to file
        saveReportToFile(report);
        
        res.status(201).json({ 
            message: 'Report saved successfully', 
            id: report.id 
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save report' });
    }
});

// Download report as file
app.get('/api/reports/:id/download', (req, res) => {
    const report = reports.find(r => r.id === req.params.id);
    if (!report) {
        return res.status(404).json({ error: 'Report not found' });
    }
    
    const reportContent = generateReportContent(report);
    const filename = `proctoring-report-${report.id}.txt`;
    
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/plain');
    res.send(reportContent);
});

// Generate a unique ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Save report to file
function saveReportToFile(report) {
    const filename = `report-${report.id}.json`;
    const filepath = path.join(reportsDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
}

// Generate report content for download
function generateReportContent(report) {
    return `
=== VIDEO INTERVIEW PROCTORING REPORT ===
Report ID: ${report.id}
Candidate Name: ${report.candidateName || 'Test Candidate'}
Interview Duration: ${report.interviewDuration}
Start Time: ${report.startTime}
End Time: ${report.endTime}

--- FOCUS ISSUES ---
Times looked away: ${report.focusIssues?.lookAwayCount || 0}
Times no face detected: ${report.focusIssues?.noFaceCount || 0}
Multiple faces detected: ${report.focusIssues?.multipleFacesCount || 0}

--- PROHIBITED ITEMS ---
Phones detected: ${report.prohibitedItems?.phonesDetected || 0}
Books detected: ${report.prohibitedItems?.booksDetected || 0}
Other devices detected: ${report.prohibitedItems?.devicesDetected || 0}

--- FINAL SCORE ---
Integrity Score: ${report.integrityScore || 100}/100

=== EVENT LOG ===
${(report.events || []).map(event => `[${event.timestamp}] ${event.message}`).join('\n')}
====================
    `;
}

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});