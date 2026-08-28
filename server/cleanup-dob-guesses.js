/**
 * DOB Cleanup Script
 * Removes guessed dates of birth (1/1/XXXX format) when a better record exists.
 * 
 * Logic:
 * 1. Find all persons with DOB = Jan 1st of any year (YYYY-01-01)
 * 2. For each, check if another record exists with same name
 * 3. If duplicate has different DOB → null out the guessed DOB
 * 4. If no duplicate or duplicate also has Jan 1st → keep (might be real)
 * 
 * Usage: node cleanup-dob-guesses.js [--dry-run]
 */

import { initDb, query, run, closeDb, queryOne } from './db.js';

const dryRun = process.argv.includes('--dry-run');
const aggressive = process.argv.includes('--aggressive'); // Clean ALL Jan 1st DOBs

async function main() {
  console.log(`DOB Cleanup - ${dryRun ? 'DRY RUN' : 'LIVE MODE'}`);
  console.log('='.repeat(50));
  
  await initDb();
  
  // Find all persons with DOB = Jan 1st (YYYY-01-01 format)
  const guessedDOBs = query(`
    SELECT PersonID, FullName, DateOfBirth, EmployerID, EmployeeNumber, BadgeNumber
    FROM Person 
    WHERE DateOfBirth LIKE '%-01-01'
      AND DateOfBirth IS NOT NULL
    ORDER BY FullName, DateOfBirth
  `);
  
  console.log(`\nFound ${guessedDOBs.length} persons with Jan 1st DOB (potential guesses)`);
  
  if (guessedDOBs.length === 0) {
    console.log('No cleanup needed. Exiting.');
    await closeDb();
    return;
  }
  
  // Group by FullName to find potential duplicates
  const byName = {};
  for (const person of guessedDOBs) {
    const key = person.FullName?.toLowerCase().trim();
    if (!byName[key]) byName[key] = [];
    byName[key].push(person);
  }
  
  let toNullOut = [];
  let toKeep = [];
  let needsReview = [];
  
  console.log('\nAnalyzing each person...\n');
  
  for (const person of guessedDOBs) {
    const nameKey = person.FullName?.toLowerCase().trim();
    
    // Find other records with same name (excluding self)
    const duplicates = query(`
      SELECT PersonID, FullName, DateOfBirth, EmployerID, EmployeeNumber, BadgeNumber
      FROM Person 
      WHERE LOWER(TRIM(FullName)) = ?
        AND PersonID != ?
    `, [nameKey, person.PersonID]);
    
    if (duplicates.length === 0) {
      // No duplicate found - single entry with Jan 1st
      // Keep it as it might be real, but flag for review
      needsReview.push({
        person,
        reason: 'No duplicate found - cannot verify if DOB is real or guessed',
        action: 'KEEP (manual review recommended)'
      });
      console.log(`[REVIEW] ${person.FullName} (ID:${person.PersonID}) - DOB: ${person.DateOfBirth}`);
      console.log(`         No duplicate found - might be real DOB or unverified guess`);
    } else {
      // Has duplicate(s) - check if any have a different DOB
      const otherWithDifferentDOB = duplicates.find(d => 
        d.DateOfBirth && d.DateOfBirth !== person.DateOfBirth
      );
      
      const otherWithSameDOB = duplicates.find(d => 
        d.DateOfBirth === person.DateOfBirth
      );
      
      if (otherWithDifferentDOB) {
        // Found a duplicate with a DIFFERENT DOB - this confirms our 1/1 is a guess
        toNullOut.push({
          person,
          duplicate: otherWithDifferentDOB,
          reason: `Duplicate (ID:${otherWithDifferentDOB.PersonID}) has different DOB: ${otherWithDifferentDOB.DateOfBirth}`,
          action: 'NULL OUT'
        });
        console.log(`[CLEAN] ${person.FullName} (ID:${person.PersonID}) - DOB: ${person.DateOfBirth}`);
        console.log(`        → Duplicate (ID:${otherWithDifferentDOB.PersonID}) has DOB: ${otherWithDifferentDOB.DateOfBirth}`);
      } else if (otherWithSameDOB) {
        // Duplicate also has Jan 1st - might be real or both are guesses
        toKeep.push({
          person,
          duplicate: otherWithSameDOB,
          reason: `Duplicate (ID:${otherWithSameDOB.PersonID}) also has same DOB: ${otherWithSameDOB.DateOfBirth}`,
          action: 'KEEP (both have same DOB)'
        });
        console.log(`[KEEP] ${person.FullName} (ID:${person.PersonID}) - DOB: ${person.DateOfBirth}`);
        console.log(`       Duplicate (ID:${otherWithSameDOB.PersonID}) also has same DOB - might be real`);
      } else {
        // Duplicates exist but have NULL DOB
        needsReview.push({
          person,
          duplicates,
          reason: 'Duplicates exist but have no DOB',
          action: 'KEEP (cannot verify)'
        });
        console.log(`[REVIEW] ${person.FullName} (ID:${person.PersonID}) - DOB: ${person.DateOfBirth}`);
        console.log(`         Duplicates exist but have no DOB - cannot verify`);
      }
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY');
  console.log('='.repeat(50));
  console.log(`Total Jan 1st DOBs found: ${guessedDOBs.length}`);
  console.log(`  → To NULL out (confirmed guesses): ${toNullOut.length}`);
  console.log(`  → To KEEP (might be real): ${toKeep.length}`);
  console.log(`  → Needs manual review: ${needsReview.length}`);
  
  if (toNullOut.length > 0) {
    console.log('\n--- CONFIRMED GUESSES (will be nulled) ---');
    toNullOut.forEach((item, i) => {
      console.log(`${i+1}. ${item.person.FullName} (ID:${item.person.PersonID})`);
      console.log(`   Current: ${item.person.DateOfBirth}`);
      console.log(`   ${item.reason}`);
    });
  }
  
  if (toKeep.length > 0) {
    console.log('\n--- KEEPING (duplicates confirm same DOB) ---');
    toKeep.forEach((item, i) => {
      console.log(`${i+1}. ${item.person.FullName} (ID:${item.person.PersonID})`);
      console.log(`   DOB: ${item.person.DateOfBirth}`);
      console.log(`   ${item.reason}`);
    });
  }
  
  if (needsReview.length > 0) {
    console.log('\n--- NEEDS MANUAL REVIEW ---');
    needsReview.forEach((item, i) => {
      console.log(`${i+1}. ${item.person.FullName} (ID:${item.person.PersonID})`);
      console.log(`   DOB: ${item.person.DateOfBirth}`);
      console.log(`   ${item.reason}`);
    });
  }
  
  // Execute cleanup
  // In aggressive mode, also clean the "needs review" cases
  if (aggressive && !dryRun) {
    console.log('\n[AGGRESSIVE MODE] Also cleaning unverified Jan 1st DOBs');
    for (const item of needsReview) {
      toNullOut.push({
        person: item.person,
        reason: 'AGGRESSIVE: Unverified Jan 1st DOB treated as guess',
        action: 'NULL OUT'
      });
    }
  }
  
  if (!dryRun && toNullOut.length > 0) {
    console.log('\n' + '='.repeat(50));
    console.log('EXECUTING CLEANUP...');
    console.log('='.repeat(50));
    
    let updated = 0;
    for (const item of toNullOut) {
      try {
        run(`
          UPDATE Person 
          SET DateOfBirth = NULL, 
              UpdatedAt = CURRENT_TIMESTAMP 
          WHERE PersonID = ?
        `, [item.person.PersonID]);
        
        updated++;
        console.log(`✓ Nulled DOB for: ${item.person.FullName} (ID:${item.person.PersonID})`);
      } catch (err) {
        console.error(`✗ Failed to update ${item.person.FullName}: ${err.message}`);
      }
    }
    
    console.log(`\n✓ Cleanup complete: ${updated} records updated`);
  } else if (dryRun && toNullOut.length > 0) {
    console.log('\n[DRY RUN - No changes made]');
    console.log(`Would have nulled out: ${toNullOut.length} records`);
  } else {
    console.log('\n✓ No cleanup needed - no confirmed guesses found');
  }
  
  await closeDb();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
