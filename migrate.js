require('dotenv').config();
const fs=require('fs');const path=require('path');const {Pool}=require('pg');
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
(async()=>{try{const sql=fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8');await pool.query(sql);console.log('Database schema created/updated.');}catch(e){console.error('Migration failed:',e.message);process.exitCode=1;}finally{await pool.end();}})();
