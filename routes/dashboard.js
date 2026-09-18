import express from 'express';
import { connectToDatabase } from '../db.js';
import { verifyDashboardToken } from '../auth.js';

const router = express.Router();

router.get('/stats', verifyDashboardToken, async (req, res) => {
  let client;
  try {
    const rawYear = req.query.year;
    const yearParam = (Array.isArray(rawYear) ? rawYear[0] : rawYear) || '2026-27';

    client = await connectToDatabase();

    const statusCountsQuery = `
      SELECT  
        COUNT(*) as total_files, 
        COUNT(CASE WHEN f.work_request_id IS NOT NULL THEN 1 END) as total_work_related, 
        COUNT(CASE WHEN s.code = 'DRAFT' THEN 1 END) as draft, 
        COUNT(CASE WHEN s.code = 'DRAFT' AND f.work_request_id IS NOT NULL THEN 1 END) as draft_work_related, 
        COUNT(CASE WHEN s.code IN ('PENDING', 'PENDING_APPROVAL') THEN 1 END) as pending, 
        COUNT(CASE WHEN s.code IN ('PENDING', 'PENDING_APPROVAL') AND f.work_request_id IS NOT NULL THEN 1 END) as pending_work_related, 
        COUNT(CASE WHEN s.code = 'IN_PROGRESS' THEN 1 END) as in_progress, 
        COUNT(CASE WHEN s.code = 'IN_PROGRESS' AND f.work_request_id IS NOT NULL THEN 1 END) as in_progress_work_related, 
        COUNT(CASE WHEN s.code = 'APPROVED' THEN 1 END) as approved, 
        COUNT(CASE WHEN s.code = 'APPROVED' AND f.work_request_id IS NOT NULL THEN 1 END) as approved_work_related, 
        COUNT(CASE WHEN s.code = 'REJECTED' THEN 1 END) as rejected, 
        COUNT(CASE WHEN s.code = 'REJECTED' AND f.work_request_id IS NOT NULL THEN 1 END) as rejected_work_related, 
        COUNT(CASE WHEN s.code = 'COMPLETED' THEN 1 END) as completed, 
        COUNT(CASE WHEN s.code = 'COMPLETED' AND f.work_request_id IS NOT NULL THEN 1 END) as completed_work_related, 
        COUNT(CASE WHEN f.sla_breached = true THEN 1 END) as overdue, 
        COUNT(CASE WHEN f.sla_breached = true AND f.work_request_id IS NOT NULL THEN 1 END) as overdue_work_related 
      FROM efiling_files f 
      LEFT JOIN efiling_file_status s ON f.status_id = s.id 
      WHERE (f.department_id IS NULL OR f.department_id != 36)
      AND split_part(f.file_number, '/', 2) = $1
    `;

    const categoryCountsQuery = `
      SELECT  
        c.id, 
        c.name as category_name, 
        COUNT(f.id) as total_files, 
        SUM( 
          CASE  
            WHEN UPPER(s.code) = 'IN_PROGRESS' 
            THEN COALESCE(fc.proposed_estimated_cost, 0)  
            ELSE 0  
          END 
        ) as total_estimated_cost, 
        
        jsonb_object_agg( 
          COALESCE(s.name, 'Unknown'),  
          (SELECT COUNT(*) FROM efiling_files f2 WHERE f2.category_id = c.id AND f2.status_id = s.id AND split_part(f2.file_number, '/', 2) = $1) 
        ) as status_distribution, 
        
        ( 
          SELECT json_agg(type_summary) 
          FROM ( 
            SELECT  
              ft.id as type_id, 
              ft.name as type_name, 
              COUNT(f_sub.id) as total_files, 
              SUM( 
                CASE  
                  WHEN UPPER(s_sub.code) = 'IN_PROGRESS' 
                  THEN COALESCE(fc_sub.proposed_estimated_cost, 0)  
                  ELSE 0  
                END 
              ) as total_estimated_cost, 
              jsonb_object_agg( 
                COALESCE(s_sub.name, 'Unknown'), 
                ( 
                  SELECT COUNT(*)  
                  FROM efiling_files f3  
                  WHERE f3.category_id = c.id  
                  AND f3.file_type_id = ft.id  
                  AND f3.status_id = s_sub.id 
                  AND split_part(f3.file_number, '/', 2) = $1
                ) 
              ) as status_distribution 
            FROM efiling_file_types ft 
            JOIN efiling_files f_sub ON f_sub.file_type_id = ft.id AND f_sub.category_id = c.id 
            LEFT JOIN efiling_files_costing fc_sub ON f_sub.id = fc_sub.file_id 
            LEFT JOIN efiling_file_status s_sub ON f_sub.status_id = s_sub.id 
            WHERE split_part(f_sub.file_number, '/', 2) = $1  
            AND (f_sub.department_id IS NULL OR f_sub.department_id != 36) 
            GROUP BY ft.id, ft.name 
          ) type_summary 
        ) as type_breakdown 

      FROM efiling_file_categories c 
      LEFT JOIN efiling_files f ON c.id = f.category_id  
        AND split_part(f.file_number, '/', 2) = $1  
        AND (f.department_id IS NULL OR f.department_id != 36) 
      LEFT JOIN efiling_files_costing fc ON f.id = fc.file_id 
      LEFT JOIN efiling_file_status s ON f.status_id = s.id 
      GROUP BY c.id, c.name 
      ORDER BY (COUNT(f.id) > 0) DESC, COUNT(f.id) DESC, total_estimated_cost DESC
    `;

    const [statusResult, categoryResult] = await Promise.all([
      client.query(statusCountsQuery, [yearParam]),
      client.query(categoryCountsQuery, [yearParam]),
    ]);

    return res.json({
      success: true,
      year: yearParam,
      status_counts: statusResult.rows[0] || {},
      category_wise_counts: categoryResult.rows || [],
    });
  } catch (error) {
    console.error('Database query error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (client) client.release();
  }
});

export default router;