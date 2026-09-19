defmodule BonusCalculatorBackend.Repo do
  use Ecto.Repo,
    otp_app: :bonus_calculator_backend,
    adapter: Ecto.Adapters.Postgres
end
