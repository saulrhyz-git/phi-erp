-- COPIS: what each customer requires from a process's outputs (critical-to-quality requirements).
-- Each entry: { customer, requirement, measure, target, status: 'Draft' | 'Validated', source }
ALTER TABLE processes ADD COLUMN customer_requirements JSONB NOT NULL DEFAULT '[]';
