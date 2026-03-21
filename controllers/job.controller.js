// controllers/job.controller.js
import { Job } from "../models/job.model.js";
import sanitizeHTML from "../utils/sanitizeHTML.js";
import axios from "axios";
import pdf from "pdf-parse";
import { User } from "../models/user.model.js";

// Helper function to extract text from Cloudinary PDF
const extractTextFromPDF = async (url) => {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const data = await pdf(response.data);
    return data.text.toLowerCase();
  } catch (error) {
    console.error("PDF Parsing Error:", error);
    return "";
  }
};

/* -------------------------------------------------
   USER – get recommended jobs based on Profile & Resume
------------------------------------------------- */
export const getRecommendedJobs = async (req, res) => {
  try {
    const userId = req.id; // From your auth middleware
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found", success: false });
    }

    const { skills, resume, bio } = user.profile;
    let resumeText = "";

    // 1. Extract text from resume if it exists
    if (resume) {
      resumeText = await extractTextFromPDF(resume);
    }

    // 2. Fetch all active jobs (Internal + populated Company)
    const allJobs = await Job.find({}).populate("company");

    // 3. Scoring Algorithm
    const recommendedJobs = allJobs.map((job) => {
      let score = 0;
      const jobTitle = job.title.toLowerCase();
      const jobDesc = job.description.toLowerCase();
      const jobReqs = job.requirements.map(r => r.toLowerCase());

      // A. Skill Matching (High Weight: 5 points per match)
      skills.forEach((skill) => {
        const s = skill.toLowerCase();
        if (jobTitle.includes(s)) score += 5;
        if (jobDesc.includes(s)) score += 3;
        if (jobReqs.some(req => req.includes(s))) score += 4;
      });

      // B. Resume Keyword Matching (Medium Weight: 2 points per match)
      if (resumeText) {
        // Match Job Requirements against Resume content
        jobReqs.forEach((req) => {
          if (resumeText.includes(req)) score += 2;
        });
        // Match Job Title against Resume
        if (resumeText.includes(jobTitle)) score += 3;
      }

      // C. Bio Context (Lower Weight: 1 point)
      if (bio && jobTitle.split(" ").some(word => bio.toLowerCase().includes(word))) {
        score += 1;
      }

      return { job, score };
    });

    // 4. Sort by score and filter out zero-matches
    const finalRecommendations = recommendedJobs
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6) // Return top 6 matches
      .map(item => {
        // Format response to match your getAllJobs structure
        const job = item.job;
        return {
          _id: job._id,
          title: job.title,
          description: sanitizeHTML(job.description),
          location: job.location,
          jobType: job.jobType,
          salary: job.salary,
          company: job.company?.name || "External Company",
          companyLogo: job.companyLogo || job.company?.logo || null,
          applicationLink: job.applicationLink || null,
          createdAt: job.createdAt,
          matchScore: item.score // Useful for UI "Match %"
        };
      });

    return res.status(200).json({
      success: true,
      recommendations: finalRecommendations
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server Error", success: false });
  }
};
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
export const getAllJobs = async (req, res) => {
  try {
    const keyword = req.query.keyword ? String(req.query.keyword).trim() : "";
    const page = parseInt(req.query.page) || 1;
    const limit = 6;
    const skip = (page - 1) * limit;

    let query = {};

    if (keyword !== "") {
      const searchTerms = keyword.split(/\s+/).filter(term => term.length > 0);

      if (searchTerms.length > 0) {
        query.$and = searchTerms.map(term => {
          // Check if the term is a number or range (e.g., "50", "0-3")
          const isNumeric = /\d/.test(term);

          const orConditions = [
            { title: { $regex: new RegExp(`\\b${term}\\b`, 'i') } },
            { location: { $regex: new RegExp(`\\b${term}\\b`, 'i') } },
            { description: { $regex: new RegExp(`\\b${term}\\b`, 'i') } },
            { jobType: { $regex: new RegExp(`\\b${term}\\b`, 'i') } }
          ];

          // If the filter looks like a number, add numeric checks
          if (isNumeric) {
            // Extract the first number found (e.g., "50k" -> 50, "0-3" -> 0)
            const num = parseInt(term.match(/\d+/)[0]);

            orConditions.push(
              { experienceLevel: { $lte: num + 2, $gte: num - 2 } }, // Range check for experience
              { salary: { $gte: num * 1000 - 20000, $lte: num * 1000 + 20000 } } // Rough salary check
            );
          }

          return { $or: orConditions };
        });
      }
    }

    const totalJobs = await Job.countDocuments(query);
    const jobs = await Job.find(query)
      .populate("company")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

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
        experienceLevel: job.experienceLevel // Include it in response
      };
    });

    return res.status(200).json({
      status: true,
      jobs: formattedJobs,
      totalPages: Math.ceil(totalJobs / limit) || 1,
      currentPage: page
    });

  } catch (error) {
    return res.status(500).json({ status: false, message: "Server Error" });
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
