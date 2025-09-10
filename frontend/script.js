// Global variables
let videoElement = null;
let canvasElement = null;
let canvasCtx = null;
let isInterviewRunning = false;
let startTime = null;
let timerInterval = null;

// Focus detection variables
let lookAwayCount = 0;
let noFaceCount = 0;
let multipleFacesCount = 0;
let gazeDirectionHistory = [];
const GAZE_HISTORY_LENGTH = 8; // Reduced for faster response

// Object detection counters
let phoneCount = 0;
let bookCount = 0;
let deviceCount = 0;

// Detection variables
let faceMesh = null;
let objectDetectionModel = null;
let lastFaceDetectedTime = null;
let lookingAwayStartTime = null;
let noFaceStartTime = null;
let detectionInterval = null;
let objectDetectionInterval = null;

// Video recording variables
let mediaRecorder = null;
let recordedChunks = [];
let videoBlob = null;
let recordingStartTime = null;
let recordingTimerInterval = null;

// Event log array
let eventLog = [];

// Object detection classes we care about
const PROHIBITED_ITEMS = ['cell phone', 'book', 'laptop', 'keyboard', 'mouse', 'remote'];

// API Base URL
const API_BASE_URL = 'http://localhost:3000/api';

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

async function initializeApp() {
    // Get DOM elements
    videoElement = document.getElementById('webcam');
    canvasElement = document.getElementById('output-canvas');
    canvasCtx = canvasElement.getContext('2d');
    
    // Set canvas size (will be updated when video starts)
    canvasElement.width = 640;
    canvasElement.height = 480;
    
    // Set up button event listeners
    document.getElementById('start-btn').addEventListener('click', startInterview);
    document.getElementById('stop-btn').addEventListener('click', stopInterview);
    document.getElementById('download-btn').addEventListener('click', downloadReport);
    
    // Initialize status indicators
    updateStatusIndicators();
    updateScoreDisplay(100);
    
    // Load ML models
    try {
        await loadModels();
        logEvent('All AI models loaded successfully. System is ready.', 'success');
        showNotification('System initialized and ready for interview');
    } catch (error) {
        logEvent('Error loading AI models: ' + error.message, 'error');
        console.error('Error loading models:', error);
        showNotification('Error loading AI models. Please refresh the page.', 'error');
    }
    
    logEvent('Application initialized. Click "Start Interview" to begin.', 'info');
}

// Load ML models
async function loadModels() {
    logEvent('Loading face detection model...', 'info');
    // Use Blazeface for better performance
    faceMesh = await window.blazeface.load();
    logEvent('Face detection model loaded.', 'success');
    
    logEvent('Loading object detection model...', 'info');
    objectDetectionModel = await window.cocoSsd.load();
    logEvent('Object detection model loaded.', 'success');
}

// Start the interview process
async function startInterview() {
    try {
        logEvent('Starting interview process...', 'info');
        showNotification('Starting interview process...');
        
        // Request camera access
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 1280, height: 720, facingMode: 'user' } 
        });
        
        videoElement.srcObject = stream;
        
        // Wait for video to load
        videoElement.onloadedmetadata = function() {
            // Set canvas size to match video
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;
            
            // Update UI
            document.getElementById('start-btn').disabled = true;
            document.getElementById('stop-btn').disabled = false;
            document.getElementById('download-btn').disabled = true;
            
            isInterviewRunning = true;
            startTime = new Date();
            lastFaceDetectedTime = new Date();
            
            // Start timer
            startTimer();
            
            // Start video recording
            startVideoRecording(stream);
            
            // Update status
            document.getElementById('focus-status').textContent = 'Monitoring';
            document.getElementById('focus-status').className = 'status-indicator status-good';
            document.getElementById('object-status').textContent = 'Monitoring';
            document.getElementById('object-status').className = 'status-indicator status-good';
            
            logEvent('Interview started. Camera access granted.', 'success');
            showNotification('Interview started. Monitoring active.');
            
            // Start detection processes
            startFaceDetection();
            startObjectDetection();
        };
    } catch (error) {
        logEvent('Error accessing camera: ' + error.message, 'error');
        console.error('Error accessing camera:', error);
        showNotification('Camera access denied. Please allow camera permissions.', 'error');
    }
}

// Stop the interview process
function stopInterview() {
    if (!isInterviewRunning) return;
    
    // Stop video stream
    const stream = videoElement.srcObject;
    const tracks = stream.getTracks();
    
    tracks.forEach(track => {
        track.stop();
    });
    
    videoElement.srcObject = null;
    
    // Stop detection and timer
    clearInterval(detectionInterval);
    clearInterval(objectDetectionInterval);
    clearInterval(timerInterval);
    
    // Stop video recording
    stopVideoRecording();
    
    // Update UI
    document.getElementById('start-btn').disabled = false;
    document.getElementById('stop-btn').disabled = true;
    document.getElementById('download-btn').disabled = false;
    
    isInterviewRunning = false;
    
    // Update status
    document.getElementById('focus-status').textContent = 'Not Active';
    document.getElementById('focus-status').className = 'status-indicator';
    document.getElementById('object-status').textContent = 'Not Active';
    document.getElementById('object-status').className = 'status-indicator';
    
    logEvent('Interview stopped. Ready to generate report.', 'info');
    showNotification('Interview stopped. Report ready for download.');
}

// Start the timer for interview duration
function startTimer() {
    timerInterval = setInterval(function() {
        const now = new Date();
        const elapsed = new Date(now - startTime);
        
        const hours = String(elapsed.getUTCHours()).padStart(2, '0');
        const minutes = String(elapsed.getUTCMinutes()).padStart(2, '0');
        const seconds = String(elapsed.getUTCSeconds()).padStart(2, '0');
        
        document.getElementById('duration').textContent = `${hours}:${minutes}:${seconds}`;
    }, 1000);
}

// Start video recording
function startVideoRecording(stream) {
    recordedChunks = [];
    recordingStartTime = new Date();
    
    // Update UI
    document.getElementById('recording-status').textContent = 'Recording';
    document.getElementById('recording-status').className = 'status-indicator status-recording';
    document.getElementById('recording-state').textContent = 'Recording';
    
    // Start recording timer
    startRecordingTimer();
    
    try {
        // Check if MediaRecorder is supported
        if (!MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
            throw new Error('MediaRecorder not supported with required codecs');
        }
        
        mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'video/webm;codecs=vp9,opus',
            videoBitsPerSecond: 3000000
        });
        
        mediaRecorder.ondataavailable = function(event) {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = function() {
            videoBlob = new Blob(recordedChunks, { type: 'video/webm' });
            
            // Stop recording timer
            clearInterval(recordingTimerInterval);
            
            // Update UI
            document.getElementById('recording-status').textContent = 'Completed';
            document.getElementById('recording-status').className = 'status-indicator status-good';
            document.getElementById('recording-state').textContent = 'Completed';
            document.getElementById('recording-duration').textContent = '00:00:00';
            
            logEvent('Video recording completed and stored.', 'success');
        };
        
        mediaRecorder.start(1000); // Capture chunks every second
        logEvent('Video recording started.', 'info');
        
    } catch (error) {
        console.error('Error starting video recording:', error);
        logEvent('Video recording not supported in this browser: ' + error.message, 'warning');
        
        // Update UI
        document.getElementById('recording-status').textContent = 'Failed';
        document.getElementById('recording-status').className = 'status-indicator';
        document.getElementById('recording-state').textContent = 'Not Supported';
    }
}

// Stop video recording
function stopVideoRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        
        // Download the recording after a short delay
        setTimeout(() => {
            if (videoBlob) {
                downloadRecordedVideo();
            }
        }, 500);
    }
}

// Download recorded video
function downloadRecordedVideo() {
    if (!videoBlob) return;
    
    const url = URL.createObjectURL(videoBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-recording-${new Date().toISOString().slice(0, 10)}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    logEvent('Video recording downloaded.', 'success');
}

// Start recording timer
function startRecordingTimer() {
    recordingTimerInterval = setInterval(function() {
        if (!recordingStartTime) return;
        
        const now = new Date();
        const elapsed = new Date(now - recordingStartTime);
        
        const hours = String(elapsed.getUTCHours()).padStart(2, '0');
        const minutes = String(elapsed.getUTCMinutes()).padStart(2, '0');
        const seconds = String(elapsed.getUTCSeconds()).padStart(2, '0');
        
        document.getElementById('recording-duration').textContent = `${hours}:${minutes}:${seconds}`;
    }, 1000);
}

// Update all status indicators
function updateStatusIndicators() {
    document.getElementById('look-away-count').textContent = lookAwayCount;
    document.getElementById('no-face-count').textContent = noFaceCount;
    document.getElementById('multiple-faces-count').textContent = multipleFacesCount;
    document.getElementById('phone-count').textContent = phoneCount;
    document.getElementById('book-count').textContent = bookCount;
    document.getElementById('device-count').textContent = deviceCount;
    
    // Calculate integrity score (100 - deductions)
    const deductions = (lookAwayCount * 2) + (noFaceCount * 5) + (multipleFacesCount * 10) +
                      (phoneCount * 10) + (bookCount * 8) + (deviceCount * 7);
    const integrityScore = Math.max(0, 100 - deductions);
    
    document.getElementById('score').textContent = integrityScore;
    updateScoreDisplay(integrityScore);
}

// Update score display with animation
function updateScoreDisplay(score) {
    const progressCircle = document.querySelector('.score-progress');
    const scoreText = document.querySelector('.score-text');
    const scoreLabel = document.querySelector('.score-label');
    
    // Calculate stroke dashoffset (339.3 is circumference of circle with radius 54)
    const offset = 339.3 - (score / 100 * 339.3);
    progressCircle.style.strokeDashoffset = offset;
    
    // Update score text with animation
    let currentScore = parseInt(scoreText.textContent);
    const targetScore = score;
    const increment = targetScore > currentScore ? 1 : -1;
    
    const updateScore = () => {
        currentScore += increment;
        scoreText.textContent = currentScore;
        
        if ((increment > 0 && currentScore < targetScore) || 
            (increment < 0 && currentScore > targetScore)) {
            requestAnimationFrame(updateScore);
        }
    };
    
    requestAnimationFrame(updateScore);
    
    // Update score label
    if (score >= 90) {
        scoreLabel.textContent = 'Excellent';
        scoreLabel.style.color = '#2ecc71';
    } else if (score >= 70) {
        scoreLabel.textContent = 'Good';
        scoreLabel.style.color = '#f39c12';
    } else if (score >= 50) {
        scoreLabel.textContent = 'Fair';
        scoreLabel.style.color = '#e67e22';
    } else {
        scoreLabel.textContent = 'Poor';
        scoreLabel.style.color = '#e74c3c';
    }
}

// Add an event to the log
function logEvent(message, type = 'info') {
    const now = new Date();
    const timestamp = now.toTimeString().split(' ')[0];
    const logEntry = {
        timestamp: timestamp,
        message: message,
        type: type
    };
    
    eventLog.push(logEntry);
    
    // Update log count
    document.getElementById('log-count').textContent = `${eventLog.length} events`;
    
    // Create log entry element
    const logElement = document.createElement('div');
    logElement.className = `log-entry ${type}`;
    
    // Determine icon based on type
    let iconClass = 'fas fa-info-circle';
    if (type === 'warning') iconClass = 'fas fa-exclamation-triangle';
    if (type === 'error') iconClass = 'fas fa-exclamation-circle';
    if (type === 'success') iconClass = 'fas fa-check-circle';
    
    logElement.innerHTML = `
        <div class="log-icon">
            <i class="${iconClass}"></i>
        </div>
        <div class="log-content">
            <div class="log-message">${message}</div>
            <div class="log-time">${timestamp}</div>
        </div>
    `;
    
    // Add to log container
    const logContainer = document.getElementById('event-log');
    logContainer.appendChild(logElement);
    
    // Scroll to bottom
    logContainer.scrollTop = logContainer.scrollHeight;
    
    console.log(`[${timestamp}] ${message}`);
}

// Show notification toast
function showNotification(message, type = 'info') {
    const toast = document.getElementById('notification-toast');
    const toastMessage = document.getElementById('toast-message');
    
    toastMessage.textContent = message;
    
    // Set color based on type
    if (type === 'error') {
        toast.style.background = 'linear-gradient(135deg, #e74c3c, #c0392b)';
    } else if (type === 'success') {
        toast.style.background = 'linear-gradient(135deg, #2ecc71, #27ae60)';
    } else if (type === 'warning') {
        toast.style.background = 'linear-gradient(135deg, #f39c12, #e67e22)';
    } else {
        toast.style.background = 'linear-gradient(135deg, #3498db, #2980b9)';
    }
    
    toast.classList.add('show');
    
    // Auto hide after 5 seconds
    setTimeout(() => {
        toast.classList.remove('show');
    }, 5000);
}

// Start face detection - FASTER version (200ms)
function startFaceDetection() {
    logEvent('Face detection initialized. Starting monitoring...', 'info');
    
    // Run face detection every 200ms for better responsiveness (was 300ms)
    detectionInterval = setInterval(async () => {
        if (!isInterviewRunning) return;
        
        try {
            const faces = await faceMesh.estimateFaces(videoElement, false);
            
            // Clear canvas
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
            
            // Draw video frame
            canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
            
            // Process detection results
            processFaceDetectionResults(faces);
        } catch (error) {
            console.error('Error in face detection:', error);
        }
    }, 200); // Changed from 300 to 200 ms
}

// Process face detection results
function processFaceDetectionResults(faces) {
    const now = new Date();
    
    // Update focus indicator
    const focusIndicator = document.getElementById('focus-indicator');
    
    // Check if any faces are detected
    if (faces.length === 0) {
        // No faces detected - reset gaze history
        gazeDirectionHistory = [];
        
        focusIndicator.className = 'focus-indicator distracted';
        focusIndicator.innerHTML = '<i class="fas fa-user-times"></i><span>No Face Detected</span>';
        handleNoFaceDetected(now);
        return;
    }
    
    // Face detected - update last detection time
    lastFaceDetectedTime = now;
    
    // Reset no face timer if it was running
    if (noFaceStartTime !== null) {
        noFaceStartTime = null;
        logEvent('Face detected again.', 'success');
    }
    
    // Check for multiple faces
    if (faces.length > 1 && multipleFacesCount === 0) {
        multipleFacesCount++;
        updateStatusIndicators();
        logEvent(`Multiple faces detected (${faces.length}). Possible cheating attempt!`, 'error');
        showNotification('Multiple faces detected! Possible cheating attempt.', 'error');
    }
    
    // Process each face
    let isLookingAway = false;
    faces.forEach(face => {
        drawFaceLandmarks(face);
        if (checkGazeDirection(face, now)) {
            isLookingAway = true;
        }
    });
    
    // Update focus indicator
    if (isLookingAway) {
        focusIndicator.className = 'focus-indicator distracted';
        focusIndicator.innerHTML = '<i class="fas fa-eye-slash"></i><span>Looking Away</span>';
    } else {
        focusIndicator.className = 'focus-indicator';
        focusIndicator.innerHTML = '<i class="fas fa-user-check"></i><span>Candidate Focused</span>';
    }
}

// Handle case when no face is detected
function handleNoFaceDetected(now) {
    // Start timer if not already started
    if (noFaceStartTime === null) {
        noFaceStartTime = now;
        return;
    }
    
    // Check if no face for more than 10 seconds
    const noFaceDuration = (now - noFaceStartTime) / 1000;
    
    if (noFaceDuration > 8 && noFaceCount === 0) {
        noFaceCount++;
        updateStatusIndicators();
        logEvent('No face detected for more than 10 seconds!', 'error');
        showNotification('No face detected for 10+ seconds!', 'error');
        // Reset timer to avoid multiple logs
        noFaceStartTime = now;
    }
}

// IMPROVED GAZE DETECTION ALGORITHM
function checkGazeDirection(face, now) {
    // Get key landmarks for gaze detection
    const rightEye = face.landmarks[0];  // Right eye
    const leftEye = face.landmarks[1];   // Left eye
    const nose = face.landmarks[2];      // Nose
    
    // Calculate eye centers more accurately using all 3 points per eye
    const rightEyeCenter = {
        x: (rightEye[0] + rightEye[2] + rightEye[4]) / 3,
        y: (rightEye[1] + rightEye[3] + rightEye[5]) / 3
    };
    
    const leftEyeCenter = {
        x: (leftEye[0] + leftEye[2] + leftEye[4]) / 3,
        y: (leftEye[1] + leftEye[3] + leftEye[5]) / 3
    };
    
    // Calculate horizontal distance from nose to eye centers
    const rightEyeDistance = Math.abs(rightEyeCenter.x - nose[0]);
    const leftEyeDistance = Math.abs(leftEyeCenter.x - nose[0]);
    
    // Calculate face width for relative measurements
    const faceWidth = Math.abs(face.topLeft[0] - face.bottomRight[0]);
    
    // Normalize distances by face width (more accurate)
    const normalizedRightDistance = rightEyeDistance / faceWidth;
    const normalizedLeftDistance = leftEyeDistance / faceWidth;
    
    // Calculate the ratio of eye distances (should be similar if looking straight)
    const eyeDistanceRatio = Math.min(normalizedRightDistance, normalizedLeftDistance) / 
                            Math.max(normalizedRightDistance, normalizedLeftDistance);
    
    // More sensitive thresholds for better detection
    const lookingAwayThreshold = 0.12; // 12% of face width (more sensitive)
    const ratioThreshold = 0.7; // If ratio is below this, likely looking away
    
    const isLookingAway = (normalizedRightDistance > lookingAwayThreshold && 
                          normalizedLeftDistance > lookingAwayThreshold) || 
                          eyeDistanceRatio < ratioThreshold;
    
    // Add to gaze history for more stable detection
    gazeDirectionHistory.push(isLookingAway);
    if (gazeDirectionHistory.length > GAZE_HISTORY_LENGTH) {
        gazeDirectionHistory.shift();
    }
    
    // Check if majority of recent frames indicate looking away
    const lookingAwayFrames = gazeDirectionHistory.filter(val => val).length;
    const isConsistentlyLookingAway = lookingAwayFrames > GAZE_HISTORY_LENGTH * 0.6; // 60% threshold
    
    // DEBUG: Draw gaze direction indicators
    drawGazeDebugInfo(face, normalizedRightDistance, normalizedLeftDistance, isConsistentlyLookingAway);
    
    if (isConsistentlyLookingAway) {
        // User is looking away
        if (lookingAwayStartTime === null) {
            lookingAwayStartTime = now;
            logEvent('Candidate started looking away from screen.', 'warning');
            return false;
        }
        
        const lookingAwayDuration = (now - lookingAwayStartTime) / 1000;
        
        if (lookingAwayDuration > 2) { // Reduced from 5 to 2 seconds for quicker detection
            lookAwayCount++;
            updateStatusIndicators();
            logEvent(`Candidate looked away for more than 2 seconds! (${lookAwayCount} times)`, 'warning');
            showNotification('Candidate looked away for 2+ seconds!', 'warning');
            lookingAwayStartTime = now; // Reset timer
            return true;
        }
    } else {
        // User is looking at screen
        if (lookingAwayStartTime !== null) {
            const lookedAwayDuration = (now - lookingAwayStartTime) / 1000;
            if (lookedAwayDuration > 1) {
                logEvent('Candidate returned to looking at screen.', 'success');
            }
            lookingAwayStartTime = null;
        }
    }
    
    return false;
}

// Draw debug information for gaze detection
function drawGazeDebugInfo(face, rightDistance, leftDistance, isLookingAway) {
    const nose = face.landmarks[2];
    const rightEye = face.landmarks[0];
    const leftEye = face.landmarks[1];
    
    // Calculate eye centers
    const rightEyeCenter = {
        x: (rightEye[0] + rightEye[2] + rightEye[4]) / 3,
        y: (rightEye[1] + rightEye[3] + rightEye[5]) / 3
    };
    
    const leftEyeCenter = {
        x: (leftEye[0] + leftEye[2] + leftEye[4]) / 3,
        y: (leftEye[1] + leftEye[3] + leftEye[5]) / 3
    };
    
    // Draw debug information
    canvasCtx.font = '12px Arial';
    canvasCtx.fillStyle = isLookingAway ? '#FF0000' : '#00FF00';
    
    // Draw distance text
    canvasCtx.fillText(`R: ${rightDistance.toFixed(2)}`, rightEyeCenter.x + 10, rightEyeCenter.y);
    canvasCtx.fillText(`L: ${leftDistance.toFixed(2)}`, leftEyeCenter.x + 10, leftEyeCenter.y);
    
    // Draw looking away status
    canvasCtx.fillText(isLookingAway ? 'LOOKING AWAY' : 'FOCUSED', nose[0] - 30, nose[1] - 20);
}

// Draw face landmarks on canvas (for visualization)
function drawFaceLandmarks(face) {
    // Draw bounding box
    const startPoint = face.topLeft;
    const endPoint = face.bottomRight;
    const size = [endPoint[0] - startPoint[0], endPoint[1] - startPoint[1]];
    
    canvasCtx.strokeStyle = '#FF0000';
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeRect(startPoint[0], startPoint[1], size[0], size[1]);
    
    // Draw face count
    canvasCtx.fillStyle = '#FF0000';
    canvasCtx.font = '16px Arial';
    canvasCtx.fillText('Face Detected', startPoint[0], startPoint[1] - 5);
    
    // Draw landmarks
    canvasCtx.fillStyle = '#32CD32';
    face.landmarks.forEach(landmark => {
        canvasCtx.beginPath();
        canvasCtx.arc(landmark[0], landmark[1], 3, 0, 2 * Math.PI);
        canvasCtx.fill();
    });
}

// Start object detection - FASTER version (0.5 seconds)
function startObjectDetection() {
    logEvent('Object detection initialized. Monitoring for prohibited items...', 'info');
    
    // Run object detection every 0.5 seconds (was 2 seconds)
    objectDetectionInterval = setInterval(async () => {
        if (!isInterviewRunning) return;
        
        try {
            const predictions = await objectDetectionModel.detect(videoElement);
            processObjectDetectionResults(predictions);
        } catch (error) {
            console.error('Error in object detection:', error);
        }
    }, 500); // Changed from 2000 to 500 ms
}

// Process object detection results
function processObjectDetectionResults(predictions) {
    // Filter for prohibited items only
    const prohibitedItems = predictions.filter(prediction => 
        PROHIBITED_ITEMS.includes(prediction.class) && prediction.score > 0.6
    );
    
    // Draw bounding boxes and process detections
    prohibitedItems.forEach(item => {
        drawObjectDetectionBox(item);
        handleProhibitedItemDetection(item);
    });
}

// Draw object detection bounding boxes
function drawObjectDetectionBox(detection) {
    const [x, y, width, height] = detection.bbox;
    const label = `${detection.class} (${Math.round(detection.score * 100)}%)`;
    
    // Draw bounding box
    canvasCtx.strokeStyle = '#FF0000';
    canvasCtx.lineWidth = 3;
    canvasCtx.strokeRect(x, y, width, height);
    
    // Draw label background
    canvasCtx.fillStyle = '#FF0000';
    const textWidth = canvasCtx.measureText(label).width;
    canvasCtx.fillRect(x, y - 20, textWidth + 10, 20);
    
    // Draw label text
    canvasCtx.fillStyle = '#FFFFFF';
    canvasCtx.font = '16px Arial';
    canvasCtx.fillText(label, x + 5, y - 5);
}

// Handle prohibited item detection
function handleProhibitedItemDetection(item) {
    const itemClass = item.class;
    const confidence = item.score;
    
    // Update counters based on item type
    if (itemClass === 'cell phone') {
        phoneCount++;
        logEvent(`Mobile phone detected! (${Math.round(confidence * 100)}% confidence)`, 'error');
        showNotification('Mobile phone detected!', 'error');
    } else if (itemClass === 'book') {
        bookCount++;
        logEvent(`Book detected! (${Math.round(confidence * 100)}% confidence)`, 'error');
        showNotification('Book detected!', 'error');
    } else if (['laptop', 'keyboard', 'mouse', 'remote'].includes(itemClass)) {
        deviceCount++;
        logEvent(`Electronic device (${itemClass}) detected! (${Math.round(confidence * 100)}% confidence)`, 'error');
        showNotification(`Electronic device (${itemClass}) detected!`, 'error');
    }
    
    updateStatusIndicators();
}

// Generate and download report as PDF
async function downloadReport() {
    logEvent('Generating and saving proctoring report...', 'info');
    showNotification('Generating comprehensive PDF report...');
    
    // Calculate final score
    const deductions = (lookAwayCount * 2) + (noFaceCount * 5) + (multipleFacesCount * 10) +
                      (phoneCount * 10) + (bookCount * 8) + (deviceCount * 7);
    const integrityScore = Math.max(0, 100 - deductions);
    
    // Prepare report data
    const reportData = {
        candidateName: "Test Candidate",
        interviewDuration: document.getElementById('duration').textContent,
        startTime: startTime.toISOString(),
        endTime: new Date().toISOString(),
        focusIssues: {
            lookAwayCount: lookAwayCount,
            noFaceCount: noFaceCount,
            multipleFacesCount: multipleFacesCount
        },
        prohibitedItems: {
            phonesDetected: phoneCount,
            booksDetected: bookCount,
            devicesDetected: deviceCount
        },
        integrityScore: integrityScore,
        events: eventLog
    };
    
    try {
        // Save report to backend
        const response = await fetch(`${API_BASE_URL}/reports`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(reportData)
        });
        
        if (response.ok) {
            const result = await response.json();
            logEvent('Report saved successfully. Generating PDF...', 'success');
            
            // Generate and download PDF
            await generatePDFReport(reportData);
            
        } else {
            throw new Error('Failed to save report');
        }
    } catch (error) {
        console.error('Error saving report:', error);
        logEvent('Error saving report to server. Generating local PDF...', 'error');
        
        // Fallback to local PDF generation
        generatePDFReport(reportData);
    }
}

// Generate PDF report - UPDATED VERSION
async function generatePDFReport(reportData) {
    try {
        showNotification('Creating PDF report...', 'info');
        
        // Create a new jsPDF instance
        const pdf = new jspdf.jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });
        
        // Set initial y position
        let y = 20;
        
        // Add header
        pdf.setFontSize(22);
        pdf.setTextColor(67, 97, 238); // Blue color
        pdf.text('InterviewGuard Pro Report', 105, y, { align: 'center' });
        
        pdf.setFontSize(14);
        pdf.setTextColor(100, 100, 100);
        pdf.text('AI-Powered Proctoring Analysis', 105, y + 8, { align: 'center' });
        
        y += 25;
        
        // Add candidate information section
        pdf.setFontSize(16);
        pdf.setTextColor(0, 0, 0);
        pdf.text('Candidate Information', 20, y);
        
        y += 10;
        
        pdf.setFontSize(12);
        pdf.text(`Name: ${reportData.candidateName}`, 20, y);
        pdf.text(`Date: ${new Date().toLocaleDateString()}`, 20, y + 7);
        pdf.text(`Start Time: ${new Date(reportData.startTime).toLocaleTimeString()}`, 20, y + 14);
        pdf.text(`End Time: ${new Date(reportData.endTime).toLocaleTimeString()}`, 20, y + 21);
        pdf.text(`Duration: ${reportData.interviewDuration}`, 20, y + 28);
        
        y += 40;
        
        // Add integrity score
        pdf.setFontSize(16);
        pdf.text('Integrity Score', 20, y);
        
        pdf.setFontSize(36);
        pdf.setTextColor(67, 97, 238);
        pdf.text(`${reportData.integrityScore}/100`, 105, y + 10, { align: 'center' });
        
        pdf.setFontSize(12);
        pdf.setTextColor(0, 0, 0);
        pdf.text(getScoreDescription(reportData.integrityScore), 105, y + 18, { align: 'center' });
        
        y += 30;
        
        // Add focus analysis section
        pdf.setFontSize(16);
        pdf.text('Focus Analysis', 20, y);
        
        y += 10;
        
        pdf.setFontSize(12);
        pdf.text(`Times Looked Away: ${reportData.focusIssues.lookAwayCount}`, 20, y);
        pdf.text(`No Face Detected: ${reportData.focusIssues.noFaceCount}`, 20, y + 7);
        pdf.text(`Multiple Faces: ${reportData.focusIssues.multipleFacesCount}`, 20, y + 14);
        
        y += 25;
        
        // Add object detection section
        pdf.setFontSize(16);
        pdf.text('Object Detection', 20, y);
        
        y += 10;
        
        pdf.setFontSize(12);
        pdf.text(`Mobile Phones: ${reportData.prohibitedItems.phonesDetected}`, 20, y);
        pdf.text(`Books/Notes: ${reportData.prohibitedItems.booksDetected}`, 20, y + 7);
        pdf.text(`Other Devices: ${reportData.prohibitedItems.devicesDetected}`, 20, y + 14);
        
        y += 25;
        
        // Add event log section if there are events
        if (reportData.events.length > 0) {
            pdf.setFontSize(16);
            pdf.text('Event Log', 20, y);
            
            y += 10;
            
            pdf.setFontSize(10);
            
            // Add events (with pagination if needed)
            let eventsAdded = 0;
            for (const event of reportData.events) {
                if (y > 250) { // Check if we need a new page
                    pdf.addPage();
                    y = 20;
                }
                
                pdf.setTextColor(0, 0, 0);
                pdf.text(`[${event.timestamp}]`, 20, y);
                
                // Set color based on event type
                if (event.type === 'error') pdf.setTextColor(231, 76, 60);
                else if (event.type === 'warning') pdf.setTextColor(243, 156, 18);
                else if (event.type === 'success') pdf.setTextColor(46, 204, 113);
                else pdf.setTextColor(52, 152, 219);
                
                pdf.text(event.message, 40, y);
                
                y += 6;
                eventsAdded++;
                
                // Limit to 50 events to prevent PDF from getting too large
                if (eventsAdded >= 50) break;
            }
            
            if (reportData.events.length > 50) {
                y += 5;
                pdf.setTextColor(100, 100, 100);
                pdf.text(`... and ${reportData.events.length - 50} more events`, 20, y);
            }
        }
        
        y += 15;
        
        // Add final recommendation
        pdf.setFontSize(14);
        pdf.setTextColor(0, 0, 0);
        pdf.text('Recommendation:', 20, y);
        
        y += 8;
        
        pdf.setFontSize(12);
        pdf.text(getRecommendation(reportData.integrityScore), 20, y);
        
        // Add footer with generation time
        const pageCount = pdf.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            pdf.setPage(i);
            pdf.setFontSize(10);
            pdf.setTextColor(100, 100, 100);
            pdf.text(`Report generated: ${new Date().toLocaleString()}`, 105, 287, { align: 'center' });
            pdf.text(`Page ${i} of ${pageCount}`, 105, 292, { align: 'center' });
        }
        
        // Save the PDF
        pdf.save(`proctoring-report-${new Date().toISOString().slice(0, 10)}.pdf`);
        
        logEvent('PDF report downloaded successfully.', 'success');
        showNotification('PDF report downloaded successfully!', 'success');
        
    } catch (error) {
        console.error('Error generating PDF:', error);
        logEvent('Error generating PDF. Falling back to text report.', 'error');
        
        // Fallback to text report
        downloadLocalReport(reportData);
    }
}

// Fallback to text report if PDF generation fails
function downloadLocalReport(reportData) {
    const reportContent = `
INTERVIEWGUARD PRO - PROCTORING REPORT
=======================================

Candidate Information:
----------------------
Name: ${reportData.candidateName}
Interview Date: ${new Date().toLocaleDateString()}
Start Time: ${new Date(reportData.startTime).toLocaleTimeString()}
End Time: ${new Date(reportData.endTime).toLocaleTimeString()}
Duration: ${reportData.interviewDuration}

Assessment Summary:
-------------------
Integrity Score: ${reportData.integrityScore}/100
${getScoreDescription(reportData.integrityScore)}

Focus Issues:
-------------
- Looking Away: ${reportData.focusIssues.lookAwayCount} instances
- No Face Detected: ${reportData.focusIssues.noFaceCount} instances  
- Multiple Faces: ${reportData.focusIssues.multipleFacesCount} instances

Prohibited Items Detected:
--------------------------
- Mobile Phones: ${reportData.prohibitedItems.phonesDetected}
- Books/Notes: ${reportData.prohibitedItems.booksDetected}
- Other Devices: ${reportData.prohibitedItems.devicesDetected}

Detailed Event Log:
-------------------
${reportData.events.map(event => `[${event.timestamp}] ${event.message}`).join('\n')}

Final Recommendation:
--------------------
${getRecommendation(reportData.integrityScore)}

Report Generated: ${new Date().toLocaleString()}
=======================================
InterviewGuard Pro - AI-Powered Proctoring System
    `;
    
    const blob = new Blob([reportContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `proctoring-report-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    logEvent('Local report downloaded successfully.', 'success');
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

function calculateFocusScore(focusIssues) {
    const deductions = (focusIssues.lookAwayCount * 2) + (focusIssues.noFaceCount * 5) + (focusIssues.multipleFacesCount * 10);
    return Math.max(0, 100 - deductions);
}

function calculateObjectScore(prohibitedItems) {
    const deductions = (prohibitedItems.phonesDetected * 10) + (prohibitedItems.booksDetected * 8) + (prohibitedItems.devicesDetected * 7);
    return Math.max(0, 100 - deductions);
}