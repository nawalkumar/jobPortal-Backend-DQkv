// controllers/job.controller.js
import { Job } from "../models/job.model.js";
import sanitizeHTML from "../utils/sanitizeHTML.js";

/* -------------------------------------------------
   ADMIN – post a job
------------------------------------------------- */
export const postJob = async (req, res) => {
  try {
    const {
      title,
      description,
      requirements,
      salary,
      location,
      jobType,
      experience,
      position,
      companyId,
      applicationLink,
      companyLogo, // Optional
    } = req.body;
    const userId = req.id;

    if (
      !title ||
      !description ||
      !requirements ||
      !salary ||
      !location ||
      !jobType ||
      !experience ||
      !position ||
      !companyId
    ) {
      return res
        .status(400)
        .json({ message: "All fields are required", success: false });
    }

    const job = await Job.create({
      title,
      description: sanitizeHTML(description),
      requirements: requirements.split(","),
      salary: Number(salary),
      location,
      jobType,
      experienceLevel: experience,
      position,
      company: companyId,
      created_by: userId,
      applicationLink: applicationLink || null,
      companyLogo: companyLogo || null,
    });

    return res.status(201).json({
      message: "Job posted successfully.",
      job,
      status: true,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server Error", status: false });
  }
};

/* -------------------------------------------------
   USER – get all jobs (internal + external API jobs)
------------------------------------------------- */
/* -------------------------------------------------
    USER – get all jobs with Pagination & Multi-Filter
------------------------------------------------- */
export const getAllJobs = async (req, res) => {
  try {
    const keyword = req.query.keyword?.trim() || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 6;
    const skip = (page - 1) * limit;

    let mongoQuery = {};

    // 1. IMPROVED QUERY BUILDING
    if (keyword) {
      const words = keyword.split(/\s+/).filter(Boolean); // filter(Boolean) removes empty strings
      if (words.length > 0) {
        mongoQuery.$and = words.map(word => ({
          $or: [
            { title: { $regex: word, $options: "i" } },
            { description: { $regex: word, $options: "i" } },
            { location: { $regex: word, $options: "i" } },
            { jobType: { $regex: word, $options: "i" } },
            { experienceLevel: { $regex: word, $options: "i" } }
          ]
        }));
      }
    }

    // 2. CONSISTENT COUNTING
    const totalJobsInPool = await Job.countDocuments(mongoQuery).limit(200);

    // 3. FETCHING
    const jobs = await Job.find(mongoQuery)
      .populate("company")
      .sort({ createdAt: -1 })
      .limit(200) 
      .skip(skip)
      .limit(limit);

    // 4. FORMATTING (Keeping your exact logic)
    const formattedJobs = jobs.map((job) => {
      let companyName = "External Company";
      const match = job.description?.match(/<strong>Company:<\/strong>\s*([^<]+)<\/p>/i);
      if (match) {
        companyName = match[1].trim();
      } else if (job.company?.name) {
        companyName = job.company.name;
      }

      return {
        _id: job._id,
        title: job.title,
        description: sanitizeHTML(job.description),
        location: job.location,
        jobType: job.jobType,
        salary: job.salary,
        company: companyName,
        companyLogo: job.companyLogo || null,
        applicationLink: job.applicationLink || null,
        createdAt: job.createdAt,
        isExternal: !!job.applicationLink,
      };
    });

    // 5. SUCCESSFUL RESPONSE (Even if empty)
    return res.status(200).json({ 
      jobs: formattedJobs, 
      totalPages: Math.ceil(totalJobsInPool / limit) || 1,
      currentPage: page,
      status: true 
    });

  } catch (error) {
    console.error("Backend Error:", error);
    return res.status(500).json({ message: "Server Error", status: false });
  }
};
/* -------------------------------------------------
   USER – get a single job by id
------------------------------------------------- */
export const getJobById = async (req, res) => {
  try {
    const jobId = req.params.id;
    const job = await Job.findById(jobId)
      .populate("applications")
      .populate("company");

    if (!job) {
      return res
        .status(404)
        .json({ message: "Job not found", status: false });
    }

    // Extract company name from description
    let companyName = job.company?.name || "External Company";
    const match = job.description?.match(/<strong>Company:<\/strong>\s*([^<]+)<\/p>/i);
    if (match) {
      companyName = match[1].trim();
    }

    const safeJob = {
      ...job.toObject(),
      description: sanitizeHTML(job.description),
      companyLogo: job.companyLogo || null,
      company: companyName, // ← Add company name
    };

    return res.status(200).json({ job: safeJob, status: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server Error", status: false });
  }
};

/* -------------------------------------------------
   ADMIN – jobs created by the logged-in admin
------------------------------------------------- */
export const getAdminJobs = async (req, res) => {
  try {
    const adminId = req.id;

    const jobs = await Job.find({ created_by: adminId }).populate("company");

    if (!jobs || jobs.length === 0) {
      return res
        .status(404)
        .json({ message: "No jobs found", status: false });
    }

    const formatted = jobs.map((job) => {
      return {
        ...job.toObject(),
        description: sanitizeHTML(job.description),
        companyName: job.company?.name || "Unknown Company", // ✅ Only name
        company: job.company || null, // ✅ Full company object
        companyLogo: job.companyLogo || job.company?.logo || null,
      };
    });

    return res.status(200).json({ jobs: formatted, status: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server Error", status: false });
  }
};
