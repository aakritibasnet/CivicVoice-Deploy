import { listDepartments, createDepartment, listOfficers, getOfficerDetail, assignOfficerToDepartment, getOfficerActivity, } from "@/services/ward/department.service";
export async function listDepartmentsController(req, res, next) {
    try {
        const wardId = req.user?.ward_id;
        if (!wardId)
            return res.status(403).json({ ok: false, message: "Not a ward user" });
        const departments = await listDepartments(String(wardId));
        return res.json({ ok: true, departments });
    }
    catch (err) {
        next(err);
    }
}
export async function createDepartmentController(req, res, next) {
    try {
        const wardId = req.user?.ward_id;
        if (!wardId)
            return res.status(403).json({ ok: false, message: "Not a ward user" });
        const { name, description } = req.body;
        if (!name || typeof name !== "string" || name.trim().length === 0) {
            return res.status(400).json({ ok: false, message: "Department name is required" });
        }
        const dept = await createDepartment(String(wardId), name, description);
        return res.status(201).json({ ok: true, department: dept });
    }
    catch (err) {
        next(err);
    }
}
export async function listOfficersController(req, res, next) {
    try {
        const wardId = req.user?.ward_id;
        if (!wardId)
            return res.status(403).json({ ok: false, message: "Not a ward user" });
        const departmentId = req.query.department_id;
        const officers = await listOfficers(String(wardId), departmentId);
        return res.json({ ok: true, officers });
    }
    catch (err) {
        next(err);
    }
}
export async function getOfficerDetailController(req, res, next) {
    try {
        const wardId = req.user?.ward_id;
        if (!wardId)
            return res.status(403).json({ ok: false, message: "Not a ward user" });
        const officerId = req.params.officerId;
        const officer = await getOfficerDetail(officerId, String(wardId));
        if (!officer) {
            return res.status(404).json({ ok: false, message: "Officer not found" });
        }
        const activity = await getOfficerActivity(officerId, 10);
        return res.json({ ok: true, officer, activity });
    }
    catch (err) {
        next(err);
    }
}
export async function assignOfficerController(req, res, next) {
    try {
        const wardId = req.user?.ward_id;
        if (!wardId)
            return res.status(403).json({ ok: false, message: "Not a ward user" });
        const { officer_id, department_id } = req.body;
        if (!officer_id || !department_id) {
            return res.status(400).json({ ok: false, message: "officer_id and department_id are required" });
        }
        await assignOfficerToDepartment(officer_id, department_id, String(wardId));
        return res.json({ ok: true, message: "Officer assigned to department" });
    }
    catch (err) {
        next(err);
    }
}
