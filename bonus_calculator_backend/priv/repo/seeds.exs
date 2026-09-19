alias BonusCalculatorBackend.Accounts

case Accounts.get_user_by_username("admin") do
  nil ->
    {:ok, _user} = Accounts.create_user(%{"username" => "admin", "password" => "admin123"})

  _user ->
    :ok
end
