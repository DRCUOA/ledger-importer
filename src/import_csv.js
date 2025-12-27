  import fs from 'fs';
  import path from 'path';
  import crypto from 'crypto';

  const FIELD_MAP = {
    date: ['date', 'txn_date', 'posted'],
    description: ['description', 'memo', 'details'],
    amount: ['amount', 'amt', 'value'],
    debit: ['debit'],
    credit: ['credit']
  };

  // Canonical transaction contract:
  // - txn_date: ISO string (YYYY-MM-DD)
  // - description: non-empty string
  // - raw_amount: number (signed)
  // - exactly one of debit or credit > 0

  export function importCsv(db, filePath, accountId) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

    function resolveColumn(headers, aliases) {
      // headers: An array of column names (e.g., ["Date", "Details", "amt"])
      // aliases: An array of possible names we are looking for (e.g., ["trx_date", "debit", "amount"])
      return headers.findIndex(h => aliases.includes(h));
    }

    const dateIdx = resolveColumn(headers, FIELD_MAP.date);
    const descIdx = resolveColumn(headers, FIELD_MAP.description);
    const amountIdx = resolveColumn(headers, FIELD_MAP.amount);
    const debitIdx = resolveColumn(headers, FIELD_MAP.debit);
    const creditIdx = resolveColumn(headers, FIELD_MAP.credit);

    if (dateIdx === -1 || descIdx === -1) {
      throw new Error('Missing required columns');
    }

    const sourceName = path.basename(filePath);

    const hash = crypto
      .createHash('sha256')
      .update(content)
      .digest('hex');

    const insertImport = db.prepare(`
      INSERT INTO imports (source_type, source_name, source_hash)
      VALUES ('csv', ?, ?)
    `);

    const insertTxn = db.prepare(`
      INSERT INTO transactions (
        import_id,
        account_id,
        txn_date,
        description,
        debit,
        credit,
        raw_amount,
        raw_description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = db.transaction(() => {
      const info = insertImport.run(sourceName, hash);
      const importId = info.lastInsertRowid;

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');

        const rawDesc = cols[descIdx]?.trim();
        if (!rawDesc) {
          throw new Error(`Row ${i}: missing description`);
        }

        let debit = 0;
        let credit = 0;
        let rawAmount;

        if (amountIdx !== -1) {
          rawAmount = Number(cols[amountIdx]);
          if (Number.isNaN(rawAmount)) {
            throw new Error(`Row ${i}: invalid amount`);
          }
          if (rawAmount < 0) debit = Math.abs(rawAmount);
          else credit = rawAmount;
        } else {
          const d = Number(cols[debitIdx] || 0);
          const c = Number(cols[creditIdx] || 0);
          if ((d > 0 && c > 0) || (d === 0 && c === 0)) {
            throw new Error(`Row ${i}: invalid debit/credit`);
          }
          debit = d;
          credit = c;
          rawAmount = credit - debit;
        }

        insertTxn.run(
          importId,
          accountId,
          parseDate(cols[dateIdx], i),
          rawDesc,
          debit,
          credit,
          rawAmount,
          rawDesc
        );
      }
    });

    tx();
  }

  function parseDate(value, rowNum) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new Error(`Row ${rowNum}: invalid date`);
    }
    return d.toISOString().slice(0, 10);
  }


