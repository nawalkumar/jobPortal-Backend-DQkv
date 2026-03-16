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
    const keyword = req.query.keyword ? String(req.query.keyword).trim() : "";
    const page = parseInt(req.query.page) || 1;
    const limit = 6;
    const skip = (page - 1) * limit;

    let query = {};

    // Only build the search query if keyword actually has text
    if (keyword !== "") {
      // Split into words and clean out any empty spaces
      const searchTerms = keyword.split(/\s+/).filter(term => term.length > 0);
      
      if (searchTerms.length > 0) {
        // We use $or so that the search matches ANY of the words in the title or location
        // This prevents the "Server Error" caused by strict $and logic
        query.$or = searchTerms.flatMap(term => [
          { title: { $regex: term, $options: "i" } },
          { location: { $regex: term, $options: "i" } },
          { description: { $regex: term, $options: "i" } },
          { experienceLevel: { $regex: term, $options: "i" } }
        ]);
      }
    }

    // Use countDocuments first to see if anything exists
    const totalJobs = await Job.countDocuments(query);

    const jobs = await Job.find(query)
      .populate("company")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // If no jobs found, don't throw error, just return empty array
    const formattedJobs = (jobs || []).map((job) => {
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

    return res.status(200).json({
      status: true,
      jobs: formattedJobs,
      totalPages: Math.ceil(totalJobs / limit) || 1,
      currentPage: page
    });

  } catch (error) {
    // This will print the EXACT error in your Railway/Terminal logs
    console.error("DEBUGGING SEARCH ERROR:", error.message);
    return res.status(500).json({ 
      status: false, 
      message: "Server Error",
      error: error.message // Temporarily show error message to find the bug
    });
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
