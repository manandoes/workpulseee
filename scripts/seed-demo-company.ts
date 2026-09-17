/**
 * One-off demo data seed — NOT part of the app.
 *
 * Creates a single self-contained demo company ("Nimbus Creative Studio",
 * slug "nimbus-creative-demo") touching every model in prisma/schema.prisma,
 * so every screen/feature has something to show: org structure, two active
 * projects with tasks in every status, requests in every status, attendance
 * + breaks, task time entries, performance history, goals, feedback, chat,
 * announcements + a poll, a meeting, and notifications.
 *
 * Idempotent-ish: re-running deletes the previous demo company (cascades)
 * before recreating it, so you can safely run this again after tweaking it.
 *
 * Run with:
 *   npx tsx scripts/seed-demo-company.ts
 *
 * Every login uses the password: Demo@1234
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(__dirname, "../.env.local") });
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { hashPassword } from "../lib/passwords";

const DEMO_SLUG = "nimbus-creative-demo";
const PASSWORD = "Demo@1234";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set (check .env.local).");
}

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

function daysAgo(n: number, hour = 9, minute = 0): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

function daysFromNow(n: number, hour = 9, minute = 0): Date {
  return daysAgo(-n, hour, minute);
}

async function main() {
  console.log("Removing any previous demo company...");
  await db.company.deleteMany({ where: { slug: DEMO_SLUG } });

  const passwordHash = await hashPassword(PASSWORD);

  console.log("Creating company...");
  const company = await db.company.create({
    data: {
      name: "Nimbus Creative Studio",
      slug: DEMO_SLUG,
      currency: "INR",
      weeklyCapacityHours: 40,
      overloadThresholdPercent: 80,
      stalledProjectDays: 14,
      agingApprovalDays: 5,
      brandColor: "#ffcc00",
    },
  });
  const companyId = company.id;

  // --- Departments --------------------------------------------------------
  const marketingDept = await db.department.create({
    data: {
      companyId,
      name: "Marketing",
      description: "Brand, content, social and growth marketing.",
    },
  });

  // --- Company accounts (Founder + Marketing Manager) ---------------------
  const founder = await db.companyAccount.create({
    data: {
      companyId,
      fullName: "Ava Sharma",
      workEmail: "ava.founder@nimbuscreative.demo",
      phone: "+919810000001",
      passwordHash,
      role: "Owner",
    },
  });

  const marketingManager = await db.companyAccount.create({
    data: {
      companyId,
      fullName: "Rohan Mehta",
      workEmail: "rohan.marketing@nimbuscreative.demo",
      phone: "+919810000002",
      passwordHash,
      role: "Manager",
      invitedById: founder.id,
    },
  });

  const hrAccount = await db.companyAccount.create({
    data: {
      companyId,
      fullName: "Neha Kapoor",
      workEmail: "neha.hr@nimbuscreative.demo",
      phone: "+919810000003",
      passwordHash,
      role: "HR",
      invitedById: founder.id,
    },
  });

  // --- Employees ------------------------------------------------------------
  // Social Media Manager reports to the Marketing Manager; five employees
  // report either to her or straight to the Marketing Manager.
  const now = new Date();

  const socialMediaManager = await db.employee.create({
    data: {
      companyId,
      employeeCode: "EMP-001",
      fullName: "Priya Nair",
      companyEmail: "priya.social@nimbuscreative.demo",
      passwordHash,
      departmentId: marketingDept.id,
      jobRole: "Social Media Manager",
      employmentType: "FullTime",
      startDate: daysAgo(400),
      personalEmail: "priya.nair.personal@example.com",
      phone: "+919810000004",
      dateOfBirth: new Date(Date.UTC(1992, 4, 12)),
      location: "Mumbai, India",
      address: "12 Marine Drive, Mumbai",
      emergencyContactName: "Rekha Nair",
      emergencyContactPhone: "+919810099901",
      managerAccountId: marketingManager.id,
      status: "Active",
      joinedAt: daysAgo(399),
    },
  });

  const employeeSeeds = [
    {
      code: "EMP-002",
      name: "Karan Verma",
      email: "karan.content@nimbuscreative.demo",
      role: "Content Writer",
      managerId: socialMediaManager.id,
    },
    {
      code: "EMP-003",
      name: "Sana Iqbal",
      email: "sana.design@nimbuscreative.demo",
      role: "Graphic Designer",
      managerId: socialMediaManager.id,
    },
    {
      code: "EMP-004",
      name: "Vikram Rao",
      email: "vikram.seo@nimbuscreative.demo",
      role: "SEO Specialist",
      managerAccountId: marketingManager.id,
    },
    {
      code: "EMP-005",
      name: "Ishita Bose",
      email: "ishita.video@nimbuscreative.demo",
      role: "Video Editor",
      managerId: socialMediaManager.id,
    },
    {
      code: "EMP-006",
      name: "Aditya Menon",
      email: "aditya.community@nimbuscreative.demo",
      role: "Community Manager",
      managerAccountId: marketingManager.id,
    },
  ] as const;

  const employees: Record<string, string> = { "Priya Nair": socialMediaManager.id };
  for (const [i, seed] of employeeSeeds.entries()) {
    const emp = await db.employee.create({
      data: {
        companyId,
        employeeCode: seed.code,
        fullName: seed.name,
        companyEmail: seed.email,
        passwordHash,
        departmentId: marketingDept.id,
        jobRole: seed.role,
        employmentType: i === 4 ? "Contract" : "FullTime",
        startDate: daysAgo(300 - i * 20),
        personalEmail: `${seed.name.split(" ")[0].toLowerCase()}.personal@example.com`,
        phone: `+91981000000${i + 5}`,
        dateOfBirth: new Date(Date.UTC(1990 + i, i, 10 + i)),
        location: "Mumbai, India",
        managerId: "managerId" in seed ? (seed as { managerId: string }).managerId : null,
        managerAccountId:
          "managerAccountId" in seed
            ? (seed as { managerAccountId: string }).managerAccountId
            : null,
        status: "Active",
        joinedAt: daysAgo(299 - i * 20),
      },
    });
    employees[seed.name] = emp.id;
  }

  // One invited-but-not-yet-active employee, to exercise that lifecycle state.
  const invitedEmployee = await db.employee.create({
    data: {
      companyId,
      employeeCode: "EMP-007",
      fullName: "Meera Joshi",
      companyEmail: "meera.intern@nimbuscreative.demo",
      departmentId: marketingDept.id,
      jobRole: "Marketing Intern",
      employmentType: "Intern",
      status: "Invited",
      invitedById: hrAccount.id,
      inviteTokenExpiresAt: daysFromNow(7),
    },
  });

  const karanId = employees["Karan Verma"];
  const sanaId = employees["Sana Iqbal"];
  const vikramId = employees["Vikram Rao"];
  const ishitaId = employees["Ishita Bose"];
  const adityaId = employees["Aditya Menon"];
  const priyaId = socialMediaManager.id;

  // --- Permission grant: give the Social Media Manager request-deciding power
  await db.permissionGrant.create({
    data: {
      companyId,
      employeeId: priyaId,
      permission: "DecideRequests",
      grantedById: founder.id,
    },
  });

  // --- Clients & Projects ---------------------------------------------------
  const clientBloom = await db.client.create({
    data: {
      companyId,
      name: "Bloom Retail Co.",
      contactName: "Anjali Desai",
      contactEmail: "anjali@bloomretail.example",
      contactPhone: "+919820011111",
      notes: "D2C retail brand, quarterly social + content retainer.",
      status: "Active",
    },
  });

  const clientVerve = await db.client.create({
    data: {
      companyId,
      name: "Verve Fitness App",
      contactName: "Sameer Khanna",
      contactEmail: "sameer@vervefitness.example",
      contactPhone: "+919820022222",
      notes: "Fitness app launch campaign.",
      status: "Active",
    },
  });

  // A third, archived client with no active project — exercises ClientStatus.Archived.
  await db.client.create({
    data: {
      companyId,
      name: "Legacy Print Co.",
      contactName: "Old Contact",
      status: "Archived",
    },
  });

  const projectBloom = await db.project.create({
    data: {
      companyId,
      clientId: clientBloom.id,
      name: "Bloom Q3 Social Campaign",
      code: "BLOOM-Q3",
      description: "Ongoing social + content campaign for Bloom Retail.",
      status: "Active",
      startDate: daysAgo(45),
      dueDate: daysFromNow(30),
      value: 850000,
      estimatedCost: 520000,
      leadAccountId: marketingManager.id,
    },
  });

  const projectVerve = await db.project.create({
    data: {
      companyId,
      clientId: clientVerve.id,
      name: "Verve App Launch Campaign",
      code: "VERVE-LAUNCH",
      description: "Multi-channel launch campaign for the Verve fitness app.",
      status: "Active",
      startDate: daysAgo(20),
      dueDate: daysFromNow(50),
      value: 1200000,
      estimatedCost: 700000,
      leadAccountId: marketingManager.id,
    },
  });

  await db.projectMember.createMany({
    data: [
      { companyId, projectId: projectBloom.id, employeeId: priyaId },
      { companyId, projectId: projectBloom.id, employeeId: karanId },
      { companyId, projectId: projectBloom.id, employeeId: sanaId },
      { companyId, projectId: projectBloom.id, employeeId: adityaId },
      { companyId, projectId: projectVerve.id, employeeId: priyaId },
      { companyId, projectId: projectVerve.id, employeeId: vikramId },
      { companyId, projectId: projectVerve.id, employeeId: ishitaId },
      { companyId, projectId: projectVerve.id, employeeId: karanId },
    ],
  });

  // --- Tasks: cover every status, priority, overdue, project-less & client-only
  type TaskSeed = {
    projectId?: string;
    clientId?: string;
    title: string;
    description?: string;
    status: "Todo" | "InProgress" | "InReview" | "Done";
    priority: "Low" | "Medium" | "High" | "Urgent";
    assigneeId?: string;
    dueDate?: Date;
    estimatedHours?: number;
    completedAt?: Date;
  };

  const taskSeeds: TaskSeed[] = [
    // Bloom project tasks
    {
      projectId: projectBloom.id,
      title: "Draft Q3 content calendar",
      description: "30-day content calendar across Instagram and LinkedIn.",
      status: "Done",
      priority: "High",
      assigneeId: karanId,
      dueDate: daysAgo(20),
      estimatedHours: 8,
      completedAt: daysAgo(21),
    },
    {
      projectId: projectBloom.id,
      title: "Design carousel ad set",
      description: "5-slide carousel for the festive sale push.",
      status: "InReview",
      priority: "High",
      assigneeId: sanaId,
      dueDate: daysFromNow(2),
      estimatedHours: 12,
    },
    {
      projectId: projectBloom.id,
      title: "Weekly community engagement report",
      status: "InProgress",
      priority: "Medium",
      assigneeId: adityaId,
      dueDate: daysFromNow(5),
      estimatedHours: 4,
    },
    {
      projectId: projectBloom.id,
      title: "Approve influencer shortlist",
      status: "Todo",
      priority: "Medium",
      assigneeId: priyaId,
      dueDate: daysFromNow(10),
      estimatedHours: 3,
    },
    {
      // Overdue, still open — feeds the OverdueTask alert logic.
      projectId: projectBloom.id,
      title: "Finalize festive sale creative brief",
      status: "InProgress",
      priority: "Urgent",
      assigneeId: sanaId,
      dueDate: daysAgo(3),
      estimatedHours: 6,
    },
    // Verve project tasks
    {
      projectId: projectVerve.id,
      title: "Write launch press release",
      status: "Done",
      priority: "High",
      assigneeId: karanId,
      dueDate: daysAgo(10),
      estimatedHours: 6,
      completedAt: daysAgo(11),
    },
    {
      projectId: projectVerve.id,
      title: "Edit launch teaser video",
      description: "60-second teaser for paid social.",
      status: "InProgress",
      priority: "Urgent",
      assigneeId: ishitaId,
      dueDate: daysFromNow(3),
      estimatedHours: 16,
    },
    {
      projectId: projectVerve.id,
      title: "Keyword research for app landing page",
      status: "InReview",
      priority: "Medium",
      assigneeId: vikramId,
      dueDate: daysFromNow(1),
      estimatedHours: 5,
    },
    {
      // Overdue — a second one, on a different assignee/project, to make an
      // OverloadedEmployee/StalledProject-style pattern plausible too.
      projectId: projectVerve.id,
      title: "Set up launch-day analytics dashboard",
      status: "Todo",
      priority: "High",
      assigneeId: vikramId,
      dueDate: daysAgo(1),
      estimatedHours: 4,
    },
    {
      projectId: projectVerve.id,
      title: "Coordinate launch-day social takeover",
      status: "Todo",
      priority: "Low",
      assigneeId: priyaId,
      dueDate: daysFromNow(15),
      estimatedHours: 3,
    },
    // A client-direct task (no project) and a fully personal task.
    {
      clientId: clientBloom.id,
      title: "Quarterly retainer invoice review",
      status: "Todo",
      priority: "Low",
      assigneeId: undefined,
      dueDate: daysFromNow(20),
    },
    {
      title: "Personal: renew Adobe Creative Cloud license",
      status: "Todo",
      priority: "Low",
      assigneeId: sanaId,
      dueDate: daysFromNow(25),
      estimatedHours: 1,
    },
  ];

  const tasks: Record<string, string> = {};
  for (const seed of taskSeeds) {
    const task = await db.task.create({
      data: {
        companyId,
        projectId: seed.projectId ?? null,
        clientId: seed.clientId ?? null,
        title: seed.title,
        description: seed.description ?? null,
        status: seed.status,
        priority: seed.priority,
        assigneeId: seed.assigneeId ?? null,
        dueDate: seed.dueDate ?? null,
        estimatedHours: seed.estimatedHours ?? null,
        completedAt: seed.completedAt ?? null,
        createdById: marketingManager.id,
      },
    });
    tasks[seed.title] = task.id;
  }

  // Comments + an attachment on a couple of tasks.
  await db.comment.create({
    data: {
      companyId,
      taskId: tasks["Design carousel ad set"],
      authorAccountId: marketingManager.id,
      body: "Love direction B — let's push the CTA color to match brand yellow.",
    },
  });
  await db.comment.create({
    data: {
      companyId,
      taskId: tasks["Edit launch teaser video"],
      authorAccountId: founder.id,
      body: "Can we get a cut with captions burned in by Thursday?",
    },
  });
  await db.attachment.create({
    data: {
      companyId,
      taskId: tasks["Draft Q3 content calendar"],
      label: "Q3 Content Calendar (Sheet)",
      url: "https://docs.google.com/spreadsheets/d/demo-placeholder",
      addedById: marketingManager.id,
    },
  });

  // --- Task time entries (Phase 12) — mix of open + closed, every end reason.
  await db.taskTimeEntry.createMany({
    data: [
      {
        companyId,
        taskId: tasks["Weekly community engagement report"],
        employeeId: adityaId,
        startedAt: daysAgo(0, 9, 0),
        endedAt: null,
        endReason: null,
      },
      {
        companyId,
        taskId: tasks["Design carousel ad set"],
        employeeId: sanaId,
        startedAt: daysAgo(1, 10, 0),
        endedAt: daysAgo(1, 12, 30),
        endReason: "Break",
      },
      {
        companyId,
        taskId: tasks["Edit launch teaser video"],
        employeeId: ishitaId,
        startedAt: daysAgo(2, 9, 0),
        endedAt: daysAgo(2, 13, 0),
        endReason: "Stopped",
      },
      {
        companyId,
        taskId: tasks["Draft Q3 content calendar"],
        employeeId: karanId,
        startedAt: daysAgo(21, 9, 0),
        endedAt: daysAgo(21, 17, 0),
        endReason: "Done",
      },
      {
        companyId,
        taskId: tasks["Keyword research for app landing page"],
        employeeId: vikramId,
        startedAt: daysAgo(0, 18, 0),
        endedAt: daysAgo(0, 18, 30),
        endReason: "SignedOut",
      },
    ],
  });

  // --- Requests: every type, every status ------------------------------------
  await db.request.create({
    data: {
      companyId,
      employeeId: karanId,
      type: "Leave",
      status: "Pending",
      subject: "Sick leave",
      description: "Down with fever, need two days off.",
      startDate: daysFromNow(2),
      endDate: daysFromNow(3),
      dayPart: "FullDay",
    },
  });

  await db.request.create({
    data: {
      companyId,
      employeeId: sanaId,
      type: "WFH",
      status: "Approved",
      subject: "WFH for internet installation",
      description: "Fibre installation at home, need to WFH.",
      startDate: daysAgo(5),
      endDate: daysAgo(5),
      approverId: marketingManager.id,
      decisionNote: "Approved, thanks for the heads up.",
      decidedAt: daysAgo(6),
    },
  });

  await db.request.create({
    data: {
      companyId,
      employeeId: vikramId,
      type: "Reimbursement",
      status: "Rejected",
      subject: "Client dinner reimbursement",
      description: "Dinner with Verve stakeholders during the kickoff.",
      amount: 4500,
      approverId: founder.id,
      decisionNote: "Please route client entertainment through the T&E card next time.",
      decidedAt: daysAgo(8),
    },
  });

  await db.request.create({
    data: {
      companyId,
      employeeId: ishitaId,
      type: "Equipment",
      status: "Approved",
      subject: "New editing headphones",
      description: "Current pair is broken, need studio monitors for video editing.",
      approverId: marketingManager.id,
      decisionNote: "Approved — order from the usual vendor.",
      decidedAt: daysAgo(15),
    },
  });

  const pendingHrRequest = await db.request.create({
    data: {
      companyId,
      employeeId: adityaId,
      type: "HR",
      status: "Pending",
      subject: "Question about PF contribution",
      description: "Wanted to confirm this month's PF deduction looks off.",
    },
  });
  // Aging past the company's `agingApprovalDays` (5) threshold, so the
  // AgingApproval alert has something real to find once generate-alerts runs.
  await db.request.update({
    where: { id: pendingHrRequest.id },
    data: { createdAt: daysAgo(9) },
  });

  await db.request.create({
    data: {
      companyId,
      employeeId: priyaId,
      type: "Complaint",
      status: "Pending",
      subject: "Noise from the floor above",
      description: "Construction noise is disrupting client calls in the afternoons.",
    },
  });

  await db.request.create({
    data: {
      companyId,
      employeeId: karanId,
      type: "Document",
      status: "Approved",
      subject: "Employment verification letter",
      description: "Need this for a rental application.",
      approverId: hrAccount.id,
      decisionNote: "Letter emailed.",
      decidedAt: daysAgo(2),
    },
  });

  await db.request.create({
    data: {
      companyId,
      employeeId: vikramId,
      type: "Suggestion",
      status: "Pending",
      subject: "Switch to a shared SEO tool license",
      description: "We're paying for three separate SEO tools — one shared license would save cost.",
    },
  });

  // --- Goals & Feedback & Performance history --------------------------------
  await db.goal.createMany({
    data: [
      {
        companyId,
        employeeId: karanId,
        createdById: marketingManager.id,
        title: "Publish 40 blog posts this quarter",
        description: "Consistent SEO-driven content cadence for Bloom + Verve.",
        targetDate: daysFromNow(60),
        status: "Active",
      },
      {
        companyId,
        employeeId: sanaId,
        createdById: marketingManager.id,
        title: "Ship a refreshed brand template kit",
        targetDate: daysAgo(5),
        status: "Achieved",
      },
      {
        companyId,
        employeeId: vikramId,
        createdById: marketingManager.id,
        title: "Grow organic traffic 20% QoQ",
        targetDate: daysAgo(10),
        status: "Missed",
        description: "Fell short due to a mid-quarter algorithm update.",
      },
      {
        companyId,
        accountId: marketingManager.id,
        createdById: founder.id,
        title: "Grow team to 10 by year end",
        targetDate: daysFromNow(120),
        status: "Active",
      },
    ],
  });

  await db.feedback.createMany({
    data: [
      {
        companyId,
        employeeId: karanId,
        givenById: marketingManager.id,
        rating: 5,
        body: "Excellent turnaround on the Q3 calendar — really thorough.",
      },
      {
        companyId,
        employeeId: sanaId,
        givenById: marketingManager.id,
        rating: 4,
        body: "Strong visual direction, could tighten up review-cycle turnaround.",
      },
      {
        companyId,
        employeeId: vikramId,
        givenById: founder.id,
        rating: 3,
        body: "Solid technical SEO work, let's revisit the traffic goal next quarter.",
      },
      {
        companyId,
        employeeId: ishitaId,
        givenById: marketingManager.id,
        rating: 5,
        body: "The teaser cut looked fantastic, great pacing.",
      },
      {
        companyId,
        accountId: marketingManager.id,
        givenById: founder.id,
        rating: 4,
        body: "Great client handling on the Verve launch, keep it up.",
      },
    ],
  });

  await db.performanceRecord.createMany({
    data: [
      { companyId, employeeId: karanId, score: 88.5, computedAt: daysAgo(30) },
      { companyId, employeeId: karanId, score: 91.0, computedAt: daysAgo(5) },
      { companyId, employeeId: sanaId, score: 74.25, computedAt: daysAgo(20) },
      { companyId, employeeId: sanaId, score: 80.0, computedAt: daysAgo(2) },
      { companyId, employeeId: vikramId, score: 55.5, computedAt: daysAgo(10) },
      { companyId, employeeId: ishitaId, score: 92.75, computedAt: daysAgo(3) },
      { companyId, employeeId: adityaId, score: 68.0, computedAt: daysAgo(7) },
      { companyId, accountId: marketingManager.id, score: 85.0, computedAt: daysAgo(4) },
    ],
  });

  // --- Attendance + breaks ----------------------------------------------------
  // Past week of closed sessions for everyone, plus live "currently clocked in"
  // and "on break" states for two employees today.
  const allPeople = [karanId, sanaId, vikramId, ishitaId, adityaId, priyaId];
  for (const empId of allPeople) {
    for (let d = 5; d >= 1; d--) {
      await db.attendanceRecord.create({
        data: {
          companyId,
          employeeId: empId,
          clockInAt: daysAgo(d, 9, 15),
          clockOutAt: daysAgo(d, 18, 30),
        },
      });
    }
  }

  // Priya: currently clocked in (open session).
  const priyaSession = await db.attendanceRecord.create({
    data: { companyId, employeeId: priyaId, clockInAt: daysAgo(0, 9, 5), clockOutAt: null },
  });

  // Karan: currently on an open break within an open session.
  const karanSession = await db.attendanceRecord.create({
    data: { companyId, employeeId: karanId, clockInAt: daysAgo(0, 9, 30), clockOutAt: null },
  });
  await db.breakRecord.create({
    data: {
      companyId,
      employeeId: karanId,
      attendanceRecordId: karanSession.id,
      startedAt: daysAgo(0, 13, 0),
      endedAt: null,
      pausedTaskIds: [tasks["Draft Q3 content calendar"]],
    },
  });

  // A closed session with a closed lunch break for Sana, from yesterday.
  const sanaSession = await db.attendanceRecord.create({
    data: {
      companyId,
      employeeId: sanaId,
      clockInAt: daysAgo(1, 9, 0),
      clockOutAt: daysAgo(1, 18, 0),
    },
  });
  await db.breakRecord.create({
    data: {
      companyId,
      employeeId: sanaId,
      attendanceRecordId: sanaSession.id,
      startedAt: daysAgo(1, 13, 0),
      endedAt: daysAgo(1, 13, 45),
      pausedTaskIds: [],
    },
  });

  // Founder also has attendance history (Plan: attendance for all accounts).
  for (let d = 3; d >= 1; d--) {
    await db.attendanceRecord.create({
      data: {
        companyId,
        accountId: founder.id,
        clockInAt: daysAgo(d, 9, 0),
        clockOutAt: daysAgo(d, 19, 0),
      },
    });
  }
  void priyaSession;

  // --- Notifications ------------------------------------------------------
  await db.notification.createMany({
    data: [
      {
        companyId,
        recipientEmployeeId: karanId,
        type: "TaskAssigned",
        message: "You were assigned 'Write launch press release'.",
        link: `/tasks/${tasks["Write launch press release"]}`,
        readAt: daysAgo(11),
      },
      {
        companyId,
        recipientAccountId: marketingManager.id,
        type: "TaskCompleted",
        message: "Karan Verma completed 'Draft Q3 content calendar'.",
        link: `/tasks/${tasks["Draft Q3 content calendar"]}`,
        readAt: daysAgo(20),
      },
      {
        companyId,
        recipientAccountId: marketingManager.id,
        type: "RequestSubmitted",
        message: "Karan Verma submitted a Leave request.",
        link: "/requests",
      },
      {
        companyId,
        recipientEmployeeId: sanaId,
        type: "RequestDecided",
        message: "Your WFH request was approved.",
        link: "/my-space/requests",
        readAt: daysAgo(6),
      },
      {
        companyId,
        recipientEmployeeId: vikramId,
        type: "DeadlineApproaching",
        message: "'Set up launch-day analytics dashboard' was due yesterday.",
        link: `/tasks/${tasks["Set up launch-day analytics dashboard"]}`,
      },
      {
        companyId,
        recipientEmployeeId: ishitaId,
        type: "MeetingScheduled",
        message: "You were added to 'Verve Launch Kickoff Sync'.",
        link: "/settings",
      },
      {
        companyId,
        recipientEmployeeId: adityaId,
        type: "AnnouncementPosted",
        message: "New announcement: Office closed for Diwali",
        link: "/dashboard",
      },
    ],
  });

  // --- Announcement + Poll -------------------------------------------------
  const announcement = await db.announcement.create({
    data: {
      companyId,
      createdByAccountId: founder.id,
      title: "Office closed for Diwali",
      body: "The studio will be closed on the festival day. Wishing everyone a great Diwali!",
    },
  });

  const poll = await db.poll.create({
    data: { companyId, announcementId: announcement.id },
  });

  const optYes = await db.pollOption.create({
    data: { companyId, pollId: poll.id, label: "I'll be in office the day before", order: 1 },
  });
  const optNo = await db.pollOption.create({
    data: { companyId, pollId: poll.id, label: "I'll be fully remote that week", order: 2 },
  });

  await db.pollVote.createMany({
    data: [
      { companyId, pollId: poll.id, pollOptionId: optYes.id, voterEmployeeId: karanId },
      { companyId, pollId: poll.id, pollOptionId: optYes.id, voterEmployeeId: sanaId },
      { companyId, pollId: poll.id, pollOptionId: optNo.id, voterEmployeeId: vikramId },
      { companyId, pollId: poll.id, pollOptionId: optNo.id, voterAccountId: marketingManager.id },
    ],
  });

  // --- Chat: two conversations, a handful of messages -----------------------
  const convo1 = await db.conversation.create({ data: { companyId } });
  await db.conversationParticipant.createMany({
    data: [
      { companyId, conversationId: convo1.id, employeeId: karanId, lastReadAt: daysAgo(0, 8, 0) },
      { companyId, conversationId: convo1.id, accountId: marketingManager.id },
    ],
  });
  await db.chatMessage.createMany({
    data: [
      {
        companyId,
        conversationId: convo1.id,
        senderAccountId: marketingManager.id,
        body: "Hey Karan, how's the press release coming along?",
        createdAt: daysAgo(0, 9, 10),
      },
      {
        companyId,
        conversationId: convo1.id,
        senderEmployeeId: karanId,
        body: "Just sent it over for review, should be in your inbox now.",
        createdAt: daysAgo(0, 9, 12),
      },
    ],
  });

  const convo2 = await db.conversation.create({ data: { companyId } });
  await db.conversationParticipant.createMany({
    data: [
      { companyId, conversationId: convo2.id, employeeId: priyaId },
      { companyId, conversationId: convo2.id, employeeId: sanaId, lastReadAt: daysAgo(0, 10, 0) },
    ],
  });
  await db.chatMessage.create({
    data: {
      companyId,
      conversationId: convo2.id,
      senderEmployeeId: sanaId,
      body: "Carousel draft is in the shared folder, take a look when you can!",
      createdAt: daysAgo(0, 10, 5),
    },
  });

  // --- Meeting ---------------------------------------------------------------
  const meeting = await db.meeting.create({
    data: {
      companyId,
      organizerAccountId: marketingManager.id,
      title: "Verve Launch Kickoff Sync",
      description: "Align on launch week deliverables and owners.",
      startAt: daysFromNow(2, 15, 0),
      endAt: daysFromNow(2, 15, 45),
      location: "Google Meet",
      status: "Scheduled",
    },
  });
  await db.meetingParticipant.createMany({
    data: [
      { companyId, meetingId: meeting.id, accountId: marketingManager.id },
      { companyId, meetingId: meeting.id, employeeId: vikramId },
      { companyId, meetingId: meeting.id, employeeId: ishitaId },
      { companyId, meetingId: meeting.id, employeeId: priyaId },
    ],
  });

  console.log("\nDone. Demo company created:");
  console.log(`  Company slug: ${DEMO_SLUG}`);
  console.log(`  Password for every login: ${PASSWORD}`);
  console.log("\nCompany accounts:");
  console.log("  Owner (Founder):    ava.founder@nimbuscreative.demo");
  console.log("  Manager (Marketing): rohan.marketing@nimbuscreative.demo");
  console.log("  HR:                 neha.hr@nimbuscreative.demo");
  console.log("\nEmployees (sign in with employee code or company email):");
  console.log("  EMP-001  Priya Nair    priya.social@nimbuscreative.demo    (Social Media Manager)");
  console.log("  EMP-002  Karan Verma   karan.content@nimbuscreative.demo   (Content Writer)");
  console.log("  EMP-003  Sana Iqbal    sana.design@nimbuscreative.demo     (Graphic Designer)");
  console.log("  EMP-004  Vikram Rao    vikram.seo@nimbuscreative.demo      (SEO Specialist)");
  console.log("  EMP-005  Ishita Bose   ishita.video@nimbuscreative.demo    (Video Editor)");
  console.log("  EMP-006  Aditya Menon  aditya.community@nimbuscreative.demo (Community Manager)");
  console.log("  EMP-007  Meera Joshi   meera.intern@nimbuscreative.demo    (Invited, not active yet)");
  void invitedEmployee;
  void now;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
