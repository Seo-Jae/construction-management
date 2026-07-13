import { Box, Chip, Stack, Typography } from "@mui/material";
import projectInfo from "../data/project";

export default function ProjectHeader() {
  return (
    <Box
      sx={{
        bgcolor: "white",
        borderRadius: 2,
        p: 2,
        mb: 2,
        border: "1px solid #E5E7EB",
      }}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
      >
        <Chip
          label={projectInfo.workType}
          size="small"
          sx={{
            bgcolor: "#0F766E",
            color: "white",
            fontWeight: "bold",
          }}
        />

        <Typography
          variant="caption"
          color="text.secondary"
        >
          담당 : {projectInfo.manager}
        </Typography>
      </Stack>

      <Typography
        variant="h6"
        fontWeight="bold"
        sx={{ mt: 1 }}
      >
        {projectInfo.company}
      </Typography>

      <Typography
        variant="body2"
        color="text.secondary"
      >
        {projectInfo.projectName}
      </Typography>
    </Box>
  );
}