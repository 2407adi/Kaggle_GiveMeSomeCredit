import pandas as pd
import numpy as np
def preprocess_input(data: pd.DataFrame):
    data = data.copy()
    # 1. Credit Utilization per Open Credit Line
    data['CreditUtilizationPerLine'] = data['RevolvingUtilizationOfUnsecuredLines'] / (data['NumberOfOpenCreditLinesAndLoans'] + 1)

    # 2. Debt Payment Burden per Dependent
    data['DebtBurdenPerDependent'] = (data['DebtRatio'] * data['MonthlyIncome']) / (data['NumberOfDependents'] + 1)

    # 3. Serious Delinquency Rate
    data['SeriousDelinqRate'] = (
        data['NumberOfTimes90DaysLate'] + data['NumberOfTime60_89DaysPastDueNotWorse']
    ) / (data['NumberOfOpenCreditLinesAndLoans'] + 1)

    # 4. Real Estate Loan Share
    data['RealEstateLoanShare'] = data['NumberRealEstateLoansOrLines'] / (data['NumberOfOpenCreditLinesAndLoans'] + 1)

    # 5. Age-to-Open-Credit Ratio
    data['AgePerCreditLine'] = data['age'] / (data['NumberOfOpenCreditLinesAndLoans'] + 1)

    return data