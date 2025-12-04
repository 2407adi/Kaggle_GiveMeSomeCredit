import CreditResults from "@/components/CreditResults";
import { useLocation } from "react-router-dom";

const Results = () => {
  const location = useLocation();
  const apiData = location.state; // Get API response data from navigation state
  
  return <CreditResults apiData={apiData} />;
};

export default Results;