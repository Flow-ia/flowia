// utils/autoNoShow.js — cron horaire qui marque automatiquement les RDV
// passes non honores en 'no-show systeme' (Planity-like).
//
// Critere de marquage :
//   - status IN ('confirmed','pending')   -> non deja annule/complete/no_show
//   - end_time + 24h < NOW()              -> 24h de grace apres l'horaire de
//                                            fin pour laisser au commercant le
//                                            temps de marquer manuellement
//   - aucune transaction source='rdv'     -> si encaissement comptoir present
//                                            le commercant a juste oublie le
//                                            statut, on n'y touche pas
//
// Effet :
//   UPDATE appointments
//      SET status='cancelled',
//          cancelled_by='system',
//          cancelled_at=NOW(),
//          cancel_reason='no_show_automatique',
//          updated_at=NOW()
//
// Acompte conserve (= politique no-show standard, identique a annulation
// client hors delais) :
//   - PAS d'appel refundAppointment           -> pas de remboursement Stripe
//   - PAS de cancelAppointmentPayout          -> la row appointment_payouts
//     reste 'pending', le cron releasePayouts.js libere le payout vers
//     l'IBAN du commercant a release_at (appt_date + 3j) -> le commercant
//     touche bien l'acompte, comportement Planity-like.
//
// Idempotence : la condition status IN ('confirmed','pending') exclut
// naturellement les rows deja traitees (status devient 'cancelled' au
// premier tick). Pas besoin de dedup separe.
//
// Multi-tenant : SELECT global, l'action est par-row. Pas de user_id filter
// car c'est un cron systeme. Gestion timezone via booking_settings.timezone
// du merchant pour comparer end_time correctement (DST safe).
//
// Lance via index.js startCron() avec scheduleLocked (lock applicatif
// Postgres pg_try_advisory_lock, garantit 1 seul tick global meme en
// multi-instance Render). Frequence : 1x/h suffit (24h de grace, on ne
// vise pas la minute pres).

const GRACE_HOURS = 24;
const BATCH_SIZE  = 200; // garde-fou perf : si backlog enorme on traite par
                         // tranches successives sur les ticks suivants

async function runAutoNoShow(pool) {
  // Selection : RDV passes (end_time + 24h dans le passe selon timezone du
  // merchant), encore actifs (confirmed/pending), sans encaissement comptoir.
  // LEFT JOIN sur transactions source='rdv' pour exclure les RDV deja
  // encaisses en especes/carte au comptoir (le commercant a juste oublie
  // de cocher 'completed').
  //
  // La conversion timezone : (a.date::timestamp + a.end_time) AT TIME ZONE
  // bs.timezone -> instant absolu UTC, puis comparaison NOW() - 24h.
  // Defaut Europe/Paris si booking_settings.timezone absent (defensive).
  const { rows: due } = await pool.query(`
    SELECT a.id, a.user_id, a.date, a.end_time, a.payment_status,
           a.paid_amount_cents, a.stripe_payment_intent_id
      FROM appointments a
      LEFT JOIN booking_settings bs ON bs.user_id = a.user_id
      LEFT JOIN transactions t
             ON t.appointment_id = a.id AND t.source = 'rdv'
     WHERE a.status IN ('confirmed','pending')
       AND t.id IS NULL
       AND (a.date::timestamp + a.end_time)
             AT TIME ZONE COALESCE(bs.timezone, 'Europe/Paris')
           < NOW() - ($1 || ' hours')::interval
     ORDER BY a.date ASC, a.end_time ASC
     LIMIT $2
  `, [String(GRACE_HOURS), BATCH_SIZE]);

  if (!due.length) return { processed: 0 };

  // UPDATE batch via ANY($1::uuid[]) : 1 seul roundtrip DB, atomicite par-row
  // garantie par Postgres. La condition status est repetee dans le WHERE pour
  // gerer le cas (rare) ou un commercant aurait modifie le statut entre
  // SELECT et UPDATE — protege contre la double-action.
  const ids = due.map(r => r.id);
  const { rowCount } = await pool.query(`
    UPDATE appointments
       SET status         = 'cancelled',
           cancelled_by   = 'system',
           cancelled_at   = NOW(),
           cancel_reason  = 'no_show_automatique',
           updated_at     = NOW()
     WHERE id = ANY($1::uuid[])
       AND status IN ('confirmed','pending')
  `, [ids]);

  console.log(`[autoNoShow] ${rowCount}/${due.length} RDV marques no-show systeme (grace=${GRACE_HOURS}h)`);

  return { processed: rowCount, scanned: due.length };
}

module.exports = { runAutoNoShow };
