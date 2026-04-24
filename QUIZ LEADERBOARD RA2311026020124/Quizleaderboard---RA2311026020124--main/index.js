const axios = require('axios');

const BASE_URL = 'https://devapigw.vidalhealthtpa.com/srm-quiz-task';
const REG_NO = process.argv[2] || '2024CS101';
const POLL_DELAY = 5000;

if (process.argv[2]) {
    console.log(`Using custom registration number: ${REG_NO}\n`);
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function pollQuizMessages() {
    const allEvents = [];
    const seenEvents = new Set();
    const allResponses = [];
    
    console.log('Starting to poll quiz messages...\n');
    
    for (let poll = 0; poll < 10; poll++) {
        try {
            console.log(`Poll ${poll}: Fetching data...`);
            const response = await axios.get(`${BASE_URL}/quiz/messages`, {
                params: { regNo: REG_NO, poll }
            });
            
            allResponses.push(response.data);
            const { events } = response.data;
            console.log(`Poll ${poll}: Received ${events.length} events`);
            
            let newEvents = 0;
            let duplicates = 0;
            
            events.forEach(event => {
                const key = `${event.roundId}-${event.participant}`;
                
                if (!seenEvents.has(key)) {
                    seenEvents.add(key);
                    allEvents.push(event);
                    newEvents++;
                } else {
                    duplicates++;
                }
            });
            
            console.log(`Poll ${poll}: New events: ${newEvents}, Duplicates: ${duplicates}\n`);
            
            if (poll < 9) {
                console.log(`Waiting 5 seconds before next poll...\n`);
                await sleep(POLL_DELAY);
            }
        } catch (error) {
            console.error(`Error in poll ${poll}:`, error.message);
            throw error;
        }
    }
    
    console.log(`Total unique events collected: ${allEvents.length}\n`);
    console.log('All Events:');
    allEvents.forEach((event, idx) => {
        console.log(`  ${idx + 1}. Round: ${event.roundId}, Participant: ${event.participant}, Score: ${event.score}`);
    });
    console.log();
    return allEvents;
}

function generateLeaderboard(events) {
    const scoreMap = new Map();
    
    events.forEach(event => {
        const currentScore = scoreMap.get(event.participant) || 0;
        scoreMap.set(event.participant, currentScore + event.score);
    });
    
    const leaderboard = Array.from(scoreMap.entries())
        .map(([participant, totalScore]) => ({ participant, totalScore }))
        .sort((a, b) => b.totalScore - a.totalScore);
    
    return leaderboard;
}

function calculateTotalScore(leaderboard) {
    return leaderboard.reduce((sum, entry) => sum + entry.totalScore, 0);
}

async function submitLeaderboard(leaderboard) {
    console.log('Submitting leaderboard...\n');
    
    try {
        const response = await axios.post(`${BASE_URL}/quiz/submit`, {
            regNo: REG_NO,
            leaderboard
        });
        
        console.log('Full API Response:', JSON.stringify(response.data, null, 2));
        console.log('HTTP Status:', response.status);
        
        return {
            ...response.data,
            httpStatus: response.status,
            isCorrect: response.status === 200 || response.data.isCorrect === true,
            isIdempotent: response.data.isIdempotent,
            submittedTotal: response.data.submittedTotal,
            expectedTotal: response.data.expectedTotal,
            message: response.data.message || (response.status === 200 ? 'Submitted successfully' : 'Check response')
        };
    } catch (error) {
        if (error.response) {
            console.error('API Error Response:', JSON.stringify(error.response.data, null, 2));
            console.error('Status Code:', error.response.status);
        } else {
            console.error('Error submitting leaderboard:', error.message);
        }
        throw error;
    }
}

async function main() {
    try {
        console.log('='.repeat(60));
        console.log('Quiz Leaderboard System');
        console.log('='.repeat(60));
        console.log(`Registration Number: ${REG_NO}\n`);
        
        const events = await pollQuizMessages();
        
        const leaderboard = generateLeaderboard(events);
        
        console.log('='.repeat(60));
        console.log('LEADERBOARD');
        console.log('='.repeat(60));
        leaderboard.forEach((entry, index) => {
            console.log(`${index + 1}. ${entry.participant}: ${entry.totalScore} points`);
        });
        console.log('='.repeat(60));
        
        const totalScore = calculateTotalScore(leaderboard);
        console.log(`\nTotal Score (All Users): ${totalScore}\n`);
        
        const result = await submitLeaderboard(leaderboard);
        
        console.log('='.repeat(60));
        console.log('SUBMISSION RESULT');
        console.log('='.repeat(60));
        console.log(`Status: ${result.isCorrect ? '✓ CORRECT' : '✗ INCORRECT'}`);
        console.log(`Idempotent: ${result.isIdempotent ? 'Yes' : 'No'}`);
        console.log(`Submitted Total: ${result.submittedTotal}`);
        console.log(`Expected Total: ${result.expectedTotal}`);
        console.log(`Message: ${result.message}`);
        console.log('='.repeat(60));
        
        if (result.isCorrect) {
            console.log('\n🎉 SUCCESS! Leaderboard is correct!\n');
        } else {
            console.log('\n❌ FAILED! Please check the logic.\n');
        }
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

main();
