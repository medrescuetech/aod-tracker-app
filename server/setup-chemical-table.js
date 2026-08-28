import { initDb, exec, closeDb } from './db.js';

async function setup() {
  console.log('Initializing DB...');
  await initDb();
  console.log('Creating Chemical table...');
  
  try {
    exec(`
      CREATE TABLE IF NOT EXISTS Chemical (
        ChemicalID INTEGER PRIMARY KEY AUTOINCREMENT,
        Code TEXT NOT NULL UNIQUE,
        ProductName TEXT NOT NULL,
        Location TEXT,
        Quantity INTEGER,
        ContainerSize TEXT,
        TotalQuantity TEXT,
        UnitSize TEXT,
        ContainerType TEXT,
        Manufacturer TEXT,
        DGClass TEXT,
        UNNumber TEXT,
        GHSClassification TEXT,
        SignalWord TEXT,
        StorageRequirements TEXT,
        Status TEXT DEFAULT 'Active',
        Notes TEXT,
        SDSFileName TEXT,
        SDSPath TEXT,
        SDSIssueDate TEXT,
        SDSReviewDue TEXT,
        PhotoFileName TEXT,
        PhotoPath TEXT,
        ReviewDate TEXT,
        CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        UpdatedAt TEXT,
        UpdatedBy INTEGER REFERENCES User(UserID)
      );
    `);
    console.log('✓ Chemical table created successfully');
  } catch (err) {
    if (err.message.includes('already exists')) {
      console.log('✓ Chemical table already exists');
    } else {
      console.error('Error:', err.message);
    }
  }
  
  await closeDb();
}

setup().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
